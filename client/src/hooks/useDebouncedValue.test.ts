import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update the output before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    rerender({ value: "b", delay: 300 });

    // Advance only partway — output should still be "a"
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("a");
  });

  it("updates after the specified delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    rerender({ value: "b", delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("b");
  });

  it("rapid changes only produce the final value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "a", delay: 150 } },
    );

    // Rapidly change value multiple times within the delay window
    rerender({ value: "b", delay: 150 });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    rerender({ value: "c", delay: 150 });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    rerender({ value: "d", delay: 150 });

    // Still showing initial value
    expect(result.current).toBe("a");

    // Now let the full delay pass after the last change
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Only the final value should appear
    expect(result.current).toBe("d");
  });

  it("works with numeric values", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 0, delay: 100 } },
    );

    rerender({ value: 42, delay: 100 });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(42);
  });

  it("resets the timer when value changes again before delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "first", delay: 200 } },
    );

    rerender({ value: "second", delay: 200 });

    // Advance 150ms (not enough)
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("first");

    // Change value again — timer should reset
    rerender({ value: "third", delay: 200 });

    // Advance another 150ms (total 300ms from first change, but only 150ms from last)
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("first");

    // Now let the remaining 50ms pass
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe("third");
  });
});
