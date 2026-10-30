"""TTS + BGM 音频服务

使用 Edge TTS（免费）生成角色语音，内置 BGM 匹配场景情绪，
FFmpeg 混流将音频叠加到视频中。

容错设计：
- Edge TTS 不可用时跳过 TTS
- BGM 文件缺失时跳过 BGM
- FFmpeg 失败时保留原视频
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import uuid
from pathlib import Path

from app.config import Settings

logger = logging.getLogger(__name__)


async def _communicate_with_timeout(process: asyncio.subprocess.Process, timeout: float) -> tuple[bytes, bytes]:
    communication = asyncio.create_task(process.communicate())
    try:
        return await asyncio.wait_for(asyncio.shield(communication), timeout=timeout)
    except BaseException:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(asyncio.shield(communication), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                try:
                    await asyncio.wait_for(asyncio.shield(communication), timeout=5)
                except asyncio.TimeoutError:
                    communication.cancel()
        raise


# 输出目录
AUDIO_OUTPUT_DIR = Path(__file__).parent.parent / "static" / "audio"
BGM_BASE_DIR = Path(__file__).parent.parent  # bgm_directory 相对于此

# BGM 情绪关键词映射
_BGM_KEYWORD_MAP: dict[str, list[str]] = {
    "suspense": ["紧张", "危险", "黑暗", "恐惧", "悬疑", "神秘", "阴影", "暗夜", "陷阱"],
    "warm": ["温暖", "阳光", "微笑", "治愈", "温馨", "春天", "花", "晨曦"],
    "action": ["战斗", "激烈", "热血", "冲突", "追逐", "爆发", "冲锋", "对决"],
    "sad": ["悲伤", "哭泣", "离别", "失落", "雨", "黄昏", "孤独", "消逝"],
    "happy": ["欢乐", "庆祝", "胜利", "欢笑", "舞会", "节日", "聚会"],
}

# 默认 BGM
_DEFAULT_BGM = "ambient"

# BGM 文件名列表（与目录中的文件一一对应）
_BGM_FILES = ["suspense.mp3", "warm.mp3", "action.mp3", "sad.mp3", "happy.mp3", "ambient.mp3"]


def _ensure_output_dir() -> None:
    """确保音频输出目录存在"""
    AUDIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_bgm_dir(settings: Settings) -> Path:
    """确保 BGM 目录存在并生成占位文件（如果需要）

    如果 BGM 目录下没有实际音频文件，使用 FFmpeg 生成静音占位文件。
    用户可自行替换为真实 BGM 文件。

    Args:
        settings: 应用配置

    Returns:
        BGM 目录路径
    """
    bgm_dir = BGM_BASE_DIR / settings.bgm_directory
    bgm_dir.mkdir(parents=True, exist_ok=True)

    for filename in _BGM_FILES:
        filepath = bgm_dir / filename
        if not filepath.exists() or filepath.stat().st_size < 100:
            # 生成 15 秒静音占位 MP3
            # 用户可自行替换为真实 BGM 文件
            _generate_silence_placeholder(filepath, duration=15)

    return bgm_dir


def _generate_silence_placeholder(dest: Path, duration: int = 15) -> None:
    """使用 FFmpeg 生成静音占位文件

    Args:
        dest: 目标文件路径
        duration: 时长（秒）
    """
    try:
        import subprocess

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(duration),
            "-c:a", "libmp3lame",
            "-b:a", "128k",
            str(dest),
        ]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        logger.info("Generated silence placeholder BGM: %s", dest)
    except Exception:
        logger.warning("Failed to generate silence placeholder for %s (FFmpeg unavailable?)", dest)


class AudioService:
    """TTS + BGM 音频服务"""

    def __init__(self, settings: Settings):
        self.settings = settings
        _ensure_output_dir()
        self._bgm_dir: Path | None = None
        self.last_error: str | None = None

    def _get_bgm_dir(self) -> Path:
        """获取 BGM 目录（延迟初始化）"""
        if self._bgm_dir is None:
            self._bgm_dir = _ensure_bgm_dir(self.settings)
        return self._bgm_dir

    async def _generate_local_tts_placeholder(self, text: str, output_path: Path) -> bool:
        """Offline TTS placeholder via ffmpeg. Never calls network."""
        duration = max(1.0, min(6.0, len(text.strip()) * 0.12))
        freq = 380 + (sum(ord(ch) for ch in text[:16]) % 180)
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={freq}:sample_rate=44100:duration={duration:.2f}",
            "-af",
            "volume=0.18",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            str(output_path),
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            if process.returncode != 0:
                logger.warning(
                    "Local TTS placeholder failed: %s",
                    stderr.decode(errors="ignore")[:300],
                )
                return False
            return output_path.exists() and output_path.stat().st_size > 100
        except FileNotFoundError:
            logger.warning("ffmpeg not found; cannot create local TTS placeholder")
            return False
        except Exception:
            logger.warning("Local TTS placeholder error", exc_info=True)
            return False

    async def generate_tts(
        self,
        text: str,
        voice: str = "zh-CN-XiaoxiaoNeural",
        rate: str = "+0%",
        pitch: str = "+0Hz",
    ) -> str | None:
        """Generate speech URL.

        TTS_PROVIDER picks the service (Edge TTS by default). When any of
        text/image/video providers is fake the pipeline stays offline with a
        local ffmpeg placeholder. A cloud provider that fails returns None and
        leaves the reason in ``last_error`` so the run can say the line was
        skipped instead of mixing a beep into the film.
        """
        self.last_error = None
        if not text or not text.strip():
            return None

        filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
        output_path = AUDIO_OUTPUT_DIR / filename
        offline = any(
            str(getattr(self.settings, key, "") or "").lower() == "fake"
            for key in ("text_provider", "image_provider", "video_provider")
        )
        provider = str(getattr(self.settings, "tts_provider", "") or "edge").lower()

        if not offline and provider != "edge":
            from app.services.tts_providers import TTSConfig, TTSProviderError, synthesize

            config = TTSConfig.build(
                provider,
                getattr(self.settings, "tts_base_url", None),
                getattr(self.settings, "tts_api_key", None),
                getattr(self.settings, "tts_model", None),
            )
            try:
                audio = await synthesize(config, text, voice)
            except TTSProviderError as error:
                self.last_error = str(error)
            except Exception as error:  # network errors carry no secrets
                self.last_error = f"{type(error).__name__}: {error}"[:200]
            else:
                if len(audio) > 100:
                    output_path.write_bytes(audio)
                    logger.info("TTS generated: %s (provider=%s, voice=%s)", output_path, provider, voice)
                    return f"/static/audio/{filename}"
                self.last_error = "配音服务返回了空音频"
            logger.warning("TTS %s failed: %s", provider, self.last_error)
            return None

        if not offline:
            try:
                import edge_tts

                communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await communicate.save(str(output_path))
                logger.info(
                    "TTS generated: %s (voice=%s, text=%s...)",
                    output_path,
                    voice,
                    text[:30],
                )
                return f"/static/audio/{filename}"
            except ImportError:
                logger.warning("edge-tts not installed, falling back to local TTS placeholder")
            except Exception:
                logger.warning(
                    "TTS generation failed (text=%s..., voice=%s), falling back to local placeholder",
                    text[:30],
                    voice,
                    exc_info=True,
                )

        if await self._generate_local_tts_placeholder(text, output_path):
            logger.info("Local TTS placeholder generated: %s", output_path)
            return f"/static/audio/{filename}"
        return None

    def match_bgm(
        self,
        scene: str | None = None,
        expression: str | None = None,
        genre: str | None = None,
    ) -> str | None:
        """根据场景描述和表情匹配 BGM

        通过关键词匹配确定情绪类型，返回对应 BGM 文件路径。
        如果 BGM 未启用或无匹配文件，返回 None。

        Args:
            scene: 场景描述
            expression: 表情/情绪描述
            genre: 题材类型

        Returns:
            BGM 文件路径，无匹配返回 None
        """
        if not self.settings.bgm_enabled:
            return None

        # 合并所有可能包含情绪关键词的文本
        combined = " ".join(filter(None, [scene or "", expression or "", genre or ""]))

        # 关键词匹配
        for bgm_type, keywords in _BGM_KEYWORD_MAP.items():
            for kw in keywords:
                if kw in combined:
                    return self._resolve_bgm_path(bgm_type)

        # 默认 ambient
        return self._resolve_bgm_path(_DEFAULT_BGM)

    def pick_mood(self, texts: list[str], genre: str | None = None) -> str:
        """整部片的情绪：关键词命中最多的一类，平手按出现先后，都没命中用 ambient。"""
        combined = " ".join([*(t for t in texts if t), genre or ""])
        best, best_hits = _DEFAULT_BGM, 0
        for bgm_type, keywords in _BGM_KEYWORD_MAP.items():
            hits = sum(combined.count(kw) for kw in keywords)
            if hits > best_hits:
                best, best_hits = bgm_type, hits
        return best

    async def film_bgm_track(self, mood: str, genre: str | None, duration: float) -> dict[str, str | None]:
        """整部片用的一条背景音乐。

        BGM_PROVIDER=library 用本地曲库（缺的情绪用 numpy 现场合成）；云端服务商
        生成失败时退回本地曲库，并把原因放进 fallback_reason（不能叫 error：引擎会把带 error 键的结果当成失败）。返回 track_url / source / mood / fallback_reason。
        """
        from app.services import bgm_library
        from app.services.bgm_providers import BGMConfig, BGMProviderError, generate, music_prompt

        config = BGMConfig.build(
            getattr(self.settings, "bgm_provider", "library"),
            getattr(self.settings, "bgm_base_url", None),
            getattr(self.settings, "bgm_api_key", None),
            getattr(self.settings, "bgm_model", None),
        )
        error: str | None = None
        if config.provider != "library":
            try:
                data = await generate(config, music_prompt(mood, genre), duration)
                if len(data) < 1000:
                    raise BGMProviderError("返回的音频太短")
                _ensure_output_dir()
                filename = f"bgm_{uuid.uuid4().hex[:8]}.mp3"
                (AUDIO_OUTPUT_DIR / filename).write_bytes(data)
                return {"track_url": f"/static/audio/{filename}", "source": config.provider, "mood": mood, "fallback_reason": None}
            except BGMProviderError as exc:
                error = str(exc)
            except Exception as exc:  # noqa: BLE001
                error = f"{type(exc).__name__}"
            logger.warning("Cloud BGM failed (%s), falling back to the local library", config.provider)
        bgm_dir = BGM_BASE_DIR / self.settings.bgm_directory
        track = await asyncio.to_thread(bgm_library.ensure_track, bgm_dir, mood)
        if track is None:
            return {"track_url": None, "source": None, "mood": mood, "fallback_reason": error or "本地曲库合成失败"}
        relative = track.resolve().relative_to((BGM_BASE_DIR / "static").resolve())
        return {"track_url": f"/static/{relative.as_posix()}", "source": "library", "mood": mood, "fallback_reason": error}

    def _resolve_bgm_path(self, bgm_type: str) -> str | None:
        """解析 BGM 文件路径

        Args:
            bgm_type: BGM 类型名称

        Returns:
            BGM 文件 URL（如 /static/bgm/suspense.mp3），文件不存在返回 None
        """
        bgm_dir = self._get_bgm_dir()
        filepath = bgm_dir / f"{bgm_type}.mp3"
        if filepath.exists() and filepath.stat().st_size > 100:
            # 直接拼接为 /static/bgm/xxx.mp3 URL
            return f"/static/bgm/{bgm_type}.mp3"
        return None

    async def mix_audio_into_video(
        self,
        video_path: str,
        tts_path: str | None = None,
        bgm_path: str | None = None,
        bgm_volume: float | None = None,
        tts_volume: float | None = None,
    ) -> str:
        """用 FFmpeg 将 TTS 和 BGM 混入视频

        逻辑：
        1. 如果有 TTS，将 TTS 叠加到视频音轨
        2. 如果有 BGM，将 BGM 作为背景音混入（降低音量）
        3. 保留视频原始音频（如果有）
        4. FFmpeg 失败时返回原视频路径

        Args:
            video_path: 视频文件路径（/static/videos/xxx.mp4 或本地路径）
            tts_path: TTS 音频文件路径（/static/audio/xxx.mp3）
            bgm_path: BGM 文件路径（/static/bgm/xxx.mp3）
            bgm_volume: BGM 音量覆盖（0-1），None 使用 settings
            tts_volume: TTS 音量覆盖（0-1），None 使用 settings

        Returns:
            新视频文件路径（/static/videos/xxx.mp4），失败返回原 video_path
        """
        if not tts_path and not bgm_path:
            return video_path

        from app.services.file_cleaner import get_local_path

        temp_dir = None
        try:
            video_local = get_local_path(video_path)
            if video_local is None:
                temp_dir = tempfile.TemporaryDirectory()
                video_local = Path(temp_dir.name) / "source.mp4"
                try:
                    from app.services.video_merger import get_video_merger_service

                    await get_video_merger_service().download_video(video_path, video_local)
                except Exception:
                    logger.warning("Cannot mix audio: failed to localize video", exc_info=True)
                    return video_path

            tts_local = get_local_path(tts_path) if tts_path else None
            bgm_local = get_local_path(bgm_path) if bgm_path else None
            if tts_local and not tts_local.exists():
                logger.warning("TTS file not found: %s, skipping TTS", tts_local)
                tts_local = None
            if bgm_local and not bgm_local.exists():
                logger.warning("BGM file not found: %s, skipping BGM", bgm_local)
                bgm_local = None
            if not tts_local and not bgm_local:
                return video_path

            videos_dir = AUDIO_OUTPUT_DIR.parent / "videos"
            videos_dir.mkdir(parents=True, exist_ok=True)
            output_filename = f"audio_{uuid.uuid4().hex}.mp4"
            output_path = videos_dir / output_filename
            actual_bgm_vol = bgm_volume if bgm_volume is not None else self.settings.bgm_volume
            actual_tts_vol = tts_volume if tts_volume is not None else self.settings.tts_volume

            with tempfile.TemporaryDirectory(prefix=".audio-", dir=videos_dir) as work_dir:
                temporary_output = Path(work_dir) / "mixed.mp4"
                await self._ffmpeg_mix(
                    video_local, tts_local, bgm_local,
                    temporary_output, actual_tts_vol, actual_bgm_vol,
                )
                os.link(temporary_output, output_path)
            return f"/static/videos/{output_filename}"
        except Exception:
            logger.warning("FFmpeg audio mixing failed, keeping original video", exc_info=True)
            return video_path
        finally:
            if temp_dir is not None:
                temp_dir.cleanup()

    async def _ffmpeg_mix(
        self,
        video_path: Path,
        tts_path: Path | None,
        bgm_path: Path | None,
        output_path: Path,
        tts_volume: float,
        bgm_volume: float,
    ) -> Path:
        """执行 FFmpeg 混流命令

        构建复杂的 FFmpeg filter_graph 将视频原始音频 + TTS + BGM 混合。

        Args:
            video_path: 视频文件本地路径
            tts_path: TTS 文件本地路径（可选）
            bgm_path: BGM 文件本地路径（可选）
            output_path: 输出文件本地路径
            tts_volume: TTS 音量
            bgm_volume: BGM 音量

        Returns:
            输出文件路径
        """
        # 构建 FFmpeg 输入和 filter
        inputs: list[str] = ["-i", str(video_path)]
        # 检测视频是否有音频轨
        # 我们使用 [0:a] 引用视频原始音频，如果不存在则用 anullsrc 填充

        audio_input_count = 1  # 下一个可用输入索引

        if tts_path:
            inputs.extend(["-i", str(tts_path)])
            tts_idx = audio_input_count
            audio_input_count += 1

        if bgm_path:
            inputs.extend(["-stream_loop", "-1", "-i", str(bgm_path)])
            bgm_idx = audio_input_count
            audio_input_count += 1

        # 构建 filter graph
        # 1. 视频流直接复制
        # 2. 音频混合

        # Probe the localized file only; remote downloads have completed before this point.
        probe = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-show_entries",
            "stream=codec_type,duration,duration_ts,time_base",
            "-of", "json", str(video_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        probe_stdout, probe_stderr = await _communicate_with_timeout(probe, 30)
        if probe.returncode != 0:
            raise RuntimeError(f"ffprobe audio detection failed: {probe_stderr.decode(errors='replace')[:500]}")
        probe_data = json.loads(probe_stdout)
        streams = probe_data.get("streams", [])
        video_stream = next(stream for stream in streams if stream.get("codec_type") == "video")
        duration = video_stream.get("duration")
        if duration in (None, "N/A") and video_stream.get("duration_ts") is not None:
            duration = float(video_stream["duration_ts"]) * float(video_stream["time_base"])
        duration = float(duration)
        has_original_audio = any(stream.get("codec_type") == "audio" for stream in streams)

        mix_inputs: list[str] = []
        mix_labels: list[str] = []

        if has_original_audio:
            mix_inputs.append(f"[0:a:0]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=duration={duration}[vorig]")
            mix_labels.append("[vorig]")

        if tts_path:
            # TTS 音频：调整音量，截取到视频时长
            mix_inputs.append(
                f"[{tts_idx}:a]aresample=44100,aformat=channel_layouts=stereo,"
                f"volume={tts_volume},apad,atrim=duration={duration}[tts]"
            )
            mix_labels.append("[tts]")

        if bgm_path:
            # BGM：循环播放 + 调整音量 + 截取到视频时长
            mix_inputs.append(
                f"[{bgm_idx}:a]aresample=44100,aformat=channel_layouts=stereo,"
                f"volume={bgm_volume},atrim=duration={duration}[bgm]"
            )
            mix_labels.append("[bgm]")

        # amix 混合所有实际存在的音频流，不因混音降低原音音量
        n_inputs = len(mix_labels)
        filter_chain = ";".join(mix_inputs)
        filter_chain += f";{''.join(mix_labels)}amix=inputs={n_inputs}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration={duration}[aout]"

        cmd = [
            "ffmpeg",
            "-n",
            *inputs,
            "-filter_complex", filter_chain,
            "-map", "0:v:0",     # 只取主视频流，避免封面/附图流触发 -shortest 截断
            "-map", "[aout]",    # 混合音频
            "-c:v", "copy",      # 视频流直接复制
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            str(output_path),
        ]

        logger.info("Running FFmpeg audio mix: %s", " ".join(cmd[:10]))

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await _communicate_with_timeout(process, 600)

        if process.returncode != 0:
            error_msg = stderr.decode(errors="replace")
            raise RuntimeError(f"FFmpeg audio mix failed: {error_msg[:500]}")

        logger.info("Audio mixed successfully: %s", output_path)
        return output_path
