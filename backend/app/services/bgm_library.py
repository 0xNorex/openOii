"""内置免版权背景音乐库（本地 BGM 服务商）。

曲子是这里用 numpy 合成的：柔和的铺底和弦 + 拨弦琶音 + 低音，按情绪选调式、速度
和和弦走向，渲染成 32 秒可循环的 mp3。没有采样、没有第三方素材，所以没有版权问题。
用户把自己的 ``<情绪>.mp3`` 放进 BGM 目录会优先使用；只有缺失、太小或整首静音的
文件（旧版本生成的静音占位）才会被重新合成。
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
import wave
from pathlib import Path

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
MOODS = ("warm", "happy", "sad", "suspense", "action", "ambient")

# 每个情绪：根音（MIDI）、调式音阶、每小节和弦（音阶级数）、速度、琶音密度、音色亮度
_MAJOR = (0, 2, 4, 5, 7, 9, 11)
_MINOR = (0, 2, 3, 5, 7, 8, 10)
_SPECS: dict[str, dict] = {
    "warm": {"root": 55, "scale": _MAJOR, "chords": (0, 4, 5, 3), "bpm": 84, "notes": 4, "bright": 0.35},
    "happy": {"root": 60, "scale": _MAJOR, "chords": (0, 3, 4, 0), "bpm": 112, "notes": 8, "bright": 0.5},
    "sad": {"root": 57, "scale": _MINOR, "chords": (0, 5, 2, 6), "bpm": 68, "notes": 4, "bright": 0.2},
    "suspense": {"root": 50, "scale": _MINOR, "chords": (0, 0, 5, 4), "bpm": 76, "notes": 2, "bright": 0.15},
    "action": {"root": 52, "scale": _MINOR, "chords": (0, 5, 6, 4), "bpm": 128, "notes": 8, "bright": 0.6},
    "ambient": {"root": 53, "scale": _MAJOR, "chords": (0, 3, 5, 4), "bpm": 72, "notes": 2, "bright": 0.25},
}


def _freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def _chord(spec: dict, degree: int) -> list[int]:
    scale = spec["scale"]
    notes = []
    for step in (0, 2, 4):
        index = degree + step
        notes.append(spec["root"] + scale[index % 7] + 12 * (index // 7))
    return notes


def render(mood: str, seconds: float = 32.0):
    """返回 float32 立体声数组（-1..1）。"""
    import numpy as np

    spec = _SPECS.get(mood, _SPECS["ambient"])
    total = int(seconds * SAMPLE_RATE)
    left = np.zeros(total, dtype=np.float64)
    right = np.zeros(total, dtype=np.float64)
    beat = 60.0 / spec["bpm"]
    bar = beat * 4
    bars = int(np.ceil(seconds / bar))
    rng = np.random.default_rng(sum(map(ord, mood)))

    def add(buffer, start: float, samples):
        begin = int(start * SAMPLE_RATE)
        end = min(total, begin + len(samples))
        if begin < total:
            buffer[begin:end] += samples[: end - begin]

    for index in range(bars):
        chord = _chord(spec, spec["chords"][index % len(spec["chords"])])
        start = index * bar
        # 铺底：慢起慢收的柔和和弦，两声道略微失谐，听起来更宽
        length = int(bar * 1.15 * SAMPLE_RATE)
        t = np.arange(length) / SAMPLE_RATE
        envelope = np.minimum(1.0, t / 0.6) * np.minimum(1.0, (length / SAMPLE_RATE - t) / 0.5)
        for note in chord:
            for buffer, detune in ((left, -0.06), (right, 0.06)):
                f = _freq(note + detune)
                tone = np.sin(2 * np.pi * f * t) + spec["bright"] * 0.3 * np.sin(4 * np.pi * f * t)
                add(buffer, start, 0.05 * envelope * tone)
        # 低音：每拍一个根音，短衰减
        bass_len = int(beat * 0.9 * SAMPLE_RATE)
        tb = np.arange(bass_len) / SAMPLE_RATE
        bass_env = np.exp(-tb * 3.0) * np.minimum(1.0, tb / 0.01)
        bass = 0.11 * bass_env * np.sin(2 * np.pi * _freq(chord[0] - 12) * tb)
        for b in range(4 if spec["bpm"] >= 100 else 2):
            when = start + b * (4 / (4 if spec["bpm"] >= 100 else 2)) * beat
            add(left, when, bass)
            add(right, when, bass)
        # 拨弦琶音：衰减的谐波音色，左右交替
        step = bar / spec["notes"]
        pluck_len = int(min(1.2, step * 2.5) * SAMPLE_RATE)
        tp = np.arange(pluck_len) / SAMPLE_RATE
        pluck_env = np.exp(-tp * (5.0 + 4 * spec["bright"])) * np.minimum(1.0, tp / 0.004)
        pattern = (0, 1, 2, 1) if spec["notes"] <= 4 else (0, 1, 2, 3, 2, 1, 2, 1)
        for n in range(spec["notes"]):
            idx = pattern[n % len(pattern)]
            note = chord[idx % 3] + 12 * (1 + idx // 3)
            f = _freq(note)
            tone = (
                np.sin(2 * np.pi * f * tp)
                + spec["bright"] * 0.5 * np.sin(4 * np.pi * f * tp) * np.exp(-tp * 6)
                + 0.15 * np.sin(6 * np.pi * f * tp) * np.exp(-tp * 10)
            )
            gain = 0.07 * (0.85 + 0.3 * rng.random())
            pan = 0.35 if n % 2 else -0.35
            add(left, start + n * step, gain * (1 - pan) * pluck_env * tone)
            add(right, start + n * step, gain * (1 + pan) * pluck_env * tone)

    # 简单混响：几条衰减延迟
    for delay, decay in ((0.113, 0.28), (0.197, 0.2), (0.271, 0.14)):
        shift = int(delay * SAMPLE_RATE)
        left[shift:] += decay * right[:-shift]
        right[shift:] += decay * left[:-shift]
    stereo = np.stack([left, right], axis=1)
    # 首尾淡入淡出，循环时不会有咔哒声
    fade = int(0.08 * SAMPLE_RATE)
    ramp = np.linspace(0.0, 1.0, fade)[:, None]
    stereo[:fade] *= ramp
    stereo[-fade:] *= ramp[::-1]
    peak = float(np.max(np.abs(stereo))) or 1.0
    return (stereo * (0.7 / peak)).astype(np.float32)


def write_mp3(mood: str, dest: Path, seconds: float = 32.0) -> None:
    import numpy as np

    data = render(mood, seconds)
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "track.wav"
        with wave.open(str(wav_path), "wb") as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(SAMPLE_RATE)
            handle.writeframes(pcm.tobytes())
        partial = dest.with_suffix(".part.mp3")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "160k", str(partial)],
            check=True,
            timeout=60,
        )
        partial.replace(dest)


def is_silent(path: Path) -> bool:
    """整首静音（旧版本的占位文件）返回 True。"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-v", "info", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception:  # noqa: BLE001
        return False
    for line in result.stderr.splitlines():
        if "max_volume:" in line:
            try:
                return float(line.split("max_volume:")[1].split("dB")[0]) <= -80.0
            except ValueError:
                return False
    return False


def ensure_track(directory: Path, mood: str) -> Path | None:
    """返回 ``<情绪>.mp3``；缺失或是静音占位时合成一首。合成失败返回 None。"""
    mood = mood if mood in MOODS else "ambient"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{mood}.mp3"
    if path.exists() and path.stat().st_size > 1000 and not is_silent(path):
        return path
    try:
        write_mp3(mood, path)
        logger.info("Rendered library BGM: %s", path)
        return path
    except Exception:  # noqa: BLE001
        logger.warning("Library BGM render failed for %s", mood, exc_info=True)
        return None


def library_tracks(directory: Path) -> list[str]:
    return sorted(p.stem for p in directory.glob("*.mp3") if not p.name.endswith(".part.mp3"))
