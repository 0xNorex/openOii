import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectsPage } from './ProjectsPage';
import { ApiError } from '~/types/errors';
import type { Project } from '~/types';

const invalidateQueries = vi.fn();
const removeQueries = vi.fn();
const listMock = vi.fn();
const deleteMock = vi.fn();
const deleteManyMock = vi.fn();
const cleanupDeletedProjectCaches = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

let queryState: {
  data: Project[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries, removeQueries }),
  useQuery: () => queryState,
  useMutation: (options: {
    mutationFn: (ids: number[]) => Promise<unknown>;
    onSuccess?: (_: unknown, ids: number[]) => void;
    onError?: (error: Error) => void;
  }) => ({
    mutate: async (ids: number[]) => {
      try {
        const result = await options.mutationFn(ids);
        options.onSuccess?.(result, ids);
      } catch (error) {
        options.onError?.(error as Error);
      }
    },
    isPending: false,
  }),
}));

vi.mock('~/services/api', () => ({
  projectsApi: {
    list: () => listMock(),
    delete: (id: number) => deleteMock(id),
    deleteMany: (ids: number[]) => deleteManyMock(ids),
  },
}));

vi.mock("~/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "light", toggleTheme: vi.fn() })),
}));

vi.mock("~/stores/settingsStore", () => ({
  useSettingsStore: vi.fn(() => ({ openModal: vi.fn() })),
}));

vi.mock('~/components/ui/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('~/components/ui/ConfirmModal', () => ({
  ConfirmModal: ({
    isOpen,
    title,
    message,
    onConfirm,
    onClose,
    confirmText,
    cancelText,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmText: string;
    cancelText: string;
  }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
        <button type="button" onClick={onClose}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

vi.mock('~/utils/toast', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('~/features/projects/deleteProject', () => ({
  cleanupDeletedProjectCaches: (...args: unknown[]) => cleanupDeletedProjectCaches(...args),
}));

const buildProject = (id: number, overrides: Partial<Project> = {}): Project => ({
  id,
  title: `Project ${id}`,
  story: `Story ${id}`,
  style: 'cinematic',
  summary: null,
  video_url: null,
  status: 'active',
  target_shot_count: null,
  character_hints: [],
  creation_mode: null,
  reference_images: [],
  created_at: '2026-04-11T00:00:00Z',
  updated_at: '2026-04-11T00:00:00Z',
  provider_settings: {
    text: {
      selected_key: 'anthropic',
      source: 'default',
      resolved_key: 'anthropic',
      valid: true,
      reason_code: null,
      reason_message: null,
    },
    image: {
      selected_key: 'openai',
      source: 'default',
      resolved_key: 'openai',
      valid: true,
      reason_code: null,
      reason_message: null,
    },
    video: {
      selected_key: 'openai',
      source: 'default',
      resolved_key: 'openai',
      valid: true,
      reason_code: null,
      reason_message: null,
    },
  },
  ...overrides,
});

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState = {
      data: [buildProject(1), buildProject(2, { status: 'ready' })],
      isLoading: false,
      error: null,
    };
    listMock.mockResolvedValue(queryState.data);
    deleteMock.mockResolvedValue(undefined);
    deleteManyMock.mockResolvedValue(undefined);
  });

  it('renders project list and deletes a project through the confirmation flow', async () => {
    const user = userEvent.setup();

    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

    expect(screen.getByText('Project 1')).toBeInTheDocument();
    expect(screen.getByText('Project 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除项目 Project 1' }));
    expect(screen.getByText('删除项目')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '删除' }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(deleteManyMock).toHaveBeenCalledWith([1]);
    });
    expect(cleanupDeletedProjectCaches).toHaveBeenCalledWith(
      { invalidateQueries, removeQueries },
      [1]
    );
    expect(toastSuccess).toHaveBeenCalledWith({
      title: '删除成功',
      message: '项目已删除',
    });
  });

  it('supports select all and batch deletion', async () => {
    const user = userEvent.setup();

    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: '选择' }));
    await user.click(screen.getByLabelText('全选'));
    await user.click(screen.getByRole('button', { name: '批量删除（2）' }));

    expect(screen.getByText('删除项目')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '删除' }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(deleteManyMock).toHaveBeenCalledWith([1, 2]);
    });
    expect(cleanupDeletedProjectCaches).toHaveBeenCalledWith(
      { invalidateQueries, removeQueries },
      [1, 2]
    );
    expect(toastSuccess).toHaveBeenCalledWith({
      title: '删除成功',
      message: '项目已批量删除',
    });
  });

  it('shows the empty state when there are no projects', () => {
    queryState = {
      data: [],
      isLoading: false,
      error: null,
    };

    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

    expect(screen.getByText('暂无项目')).toBeInTheDocument();
    expect(screen.getByText('开始创作你的第一个故事')).toBeInTheDocument();
  });

  it('shows load errors and wires the retry action to invalidate the project list query', async () => {
    const apiError = new ApiError({
      code: 'projects_list_failed',
      message: '列表服务暂时不可用',
      status: 503,
    });
    queryState = {
      data: undefined,
      isLoading: false,
      error: apiError,
    };

    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(screen.getByText('加载失败，请重试')).toBeInTheDocument();

    const toastPayload = toastError.mock.calls[0][0] as {
      actions?: Array<{ label: string; onClick: () => void }>;
    };
    expect(toastPayload.actions?.[0]?.label).toBe('重试');

    toastPayload.actions?.[0]?.onClick();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  it('shows delete failures without clearing the project list', async () => {
    const user = userEvent.setup();
    deleteManyMock.mockRejectedValue(
      new ApiError({
        code: 'delete_failed',
        message: '后端拒绝删除',
        status: 500,
      })
    );

    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: '删除项目 Project 2' }));
    await user.click(screen.getAllByRole('button', { name: '删除' }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith({
        title: '删除失败',
        message: '后端拒绝删除',
      });
    });
    expect(cleanupDeletedProjectCaches).not.toHaveBeenCalled();
    expect(screen.getByText('Project 2')).toBeInTheDocument();
  });

  it('uses card-style rows below sm and keeps the five-column table grid from sm up', async () => {
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><ProjectsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '选择' }));

    // 表头 <sm 隐藏，sm+ 才按表格网格展示
    const headerRow = screen.getByText('状态').parentElement;
    expect(headerRow).toHaveClass('hidden', 'sm:grid');
    expect(headerRow).toHaveClass('sm:grid-cols-[2.75rem_minmax(0,1fr)_7rem_7rem_2.75rem]');

    // 行：<sm 三列卡片布局，sm+ 维持现有五列网格
    const row = container.querySelector('article');
    expect(row).toHaveClass('grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(row).toHaveClass('sm:grid-cols-[2.75rem_minmax(0,1fr)_7rem_7rem_2.75rem]');

    // 标题 <sm 完整换行，仅 sm+ 截断
    const title = screen.getByText('Project 1');
    expect(title).toHaveClass('sm:truncate');
    expect(title).not.toHaveClass('truncate');

    // 状态胶囊+时间戳在 <sm 合并为一行，sm+ 用 contents 还原独立网格单元
    const statusLine = screen.getAllByText('未知状态')[0].parentElement;
    expect(statusLine).toHaveClass('sm:contents', 'col-start-2', 'row-start-2');

    // 删除按钮走 touch-target-dense（coarse 指针下自动 44px），可达名称保留
    const deleteButton = screen.getByRole('button', { name: '删除项目 Project 1' });
    expect(deleteButton).toHaveClass('touch-target-dense');
    const batchButton = screen.getByRole('button', { name: '批量删除（0）' });
    expect(batchButton).toHaveClass('touch-target-dense');
    expect(screen.getByRole('checkbox', { name: '选择项目 Project 1' }).closest('label')).toHaveClass('touch-target');
  });

  it('labels per-project selection and delete controls for assistive technology', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '选择' }));

    expect(screen.getByRole('checkbox', { name: '选择项目 Project 1' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '选择项目 Project 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除项目 Project 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除项目 Project 2' })).toBeInTheDocument();
  });
});
