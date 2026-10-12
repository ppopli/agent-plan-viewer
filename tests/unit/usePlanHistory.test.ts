import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlanHistory } from '../../src/web/hooks/usePlanHistory.js';
import { PlanState, BaselineCheckpoint } from '../../src/core/types.js';

const mockInitialState: PlanState = {
  rawMarkdown: '# Test Plan',
  goal: { title: 'Test Plan', description: 'Testing history' },
  tasks: [{ id: 't-1', title: 'Task 1', completed: false, indent: 0 }],
  fileChanges: [],
  diagrams: [],
  userInstructions: '',
  sections: [],
};

describe('usePlanHistory (Two-Tier History Engine)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with Tier 1 empty past/future and clean dirty flag', () => {
    const { result } = renderHook(() => usePlanHistory(mockInitialState));
    expect(result.current.past.length).toBe(0);
    expect(result.current.future.length).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.baselines.length).toBe(1); // Baseline #0
  });

  it('Tier 1: should cap past stack at maximum depth of 10', () => {
    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    // Push 15 actions
    act(() => {
      for (let i = 1; i <= 15; i++) {
        result.current.pushAction({
          ...mockInitialState,
          goal: { title: `Plan Version ${i}`, description: '' },
        });
      }
    });

    expect(result.current.past.length).toBe(10);
    expect(result.current.present.goal.title).toBe('Plan Version 15');
    // Oldest item in past should be Plan Version 5 (since 15 - 10 = 5)
    expect(result.current.past[0].goal.title).toBe('Plan Version 5');
    expect(result.current.isDirty).toBe(true);
  });

  it('Tier 1: should undo and redo correctly', () => {
    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Modified Plan', description: '' },
      });
    });

    expect(result.current.present.goal.title).toBe('Modified Plan');
    expect(result.current.canUndo).toBe(true);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.present.goal.title).toBe('Test Plan');
    expect(result.current.canRedo).toBe(true);

    // Redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.present.goal.title).toBe('Modified Plan');
  });

  it('Tier 1: should clear future stack when new action is pushed after undo', () => {
    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Version A', description: '' },
      });
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.future.length).toBe(1);

    // Push new action B
    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Version B', description: '' },
      });
    });

    expect(result.current.future.length).toBe(0);
    expect(result.current.canRedo).toBe(false);
  });

  it('Tier 2: should cap baselines at maximum depth 10', async () => {
    // Mock fetch for /api/save
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, baselineId: `base-${Date.now()}` }),
    } as any);

    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    // Save 12 times
    for (let i = 1; i <= 12; i++) {
      await act(async () => {
        await result.current.saveBaseline(`Draft ${i}`);
      });
    }

    expect(result.current.baselines.length).toBe(10);
    expect(result.current.isDirty).toBe(false);
  });

  it('Tier 2: should revert to any historical baseline', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, baselineId: 'base-1' }),
    } as any);

    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    // Make edit 1 and save as Baseline 1
    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Draft 1 Goal', description: '' },
      });
    });
    await act(async () => {
      await result.current.saveBaseline('Baseline 1');
    });

    // Make edit 2 and save as Baseline 2
    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Draft 2 Goal', description: '' },
      });
    });
    await act(async () => {
      await result.current.saveBaseline('Baseline 2');
    });

    expect(result.current.present.goal.title).toBe('Draft 2 Goal');

    // Revert to Baseline 1
    const baseline1 = result.current.baselines.find(b => b.label === 'Baseline 1')!;
    act(() => {
      result.current.revertToBaseline(baseline1.id);
    });

    expect(result.current.present.goal.title).toBe('Draft 1 Goal');
  });

  it('should discard working draft back to active baseline', () => {
    const { result } = renderHook(() => usePlanHistory(mockInitialState));

    act(() => {
      result.current.pushAction({
        ...mockInitialState,
        goal: { title: 'Unsaved Edits', description: '' },
      });
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.discardToActiveBaseline();
    });

    expect(result.current.present.goal.title).toBe('Test Plan');
    expect(result.current.isDirty).toBe(false);
  });
});
