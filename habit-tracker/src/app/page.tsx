"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Habit = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  goalPerWeek: number;
  reminders: string[];
  completions: string[];
  createdAt: string;
};

type ReminderAlert = {
  id: string;
  habitId: string;
  habitName: string;
  time: string;
  timestamp: number;
};

const STORAGE_KEY = "pulse-habits-state-v1";

const GRADIENTS = [
  "from-sky-500 to-cyan-400",
  "from-purple-500 to-indigo-500",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-pink-500",
  "from-lime-500 to-emerald-400",
];

const getDateKey = (inputDate: Date = new Date()) => {
  const date = new Date(
    Date.UTC(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate()),
  );
  return date.toISOString().slice(0, 10);
};

const DEFAULT_HABITS: Habit[] = [
  {
    id: "habit-1",
    name: "Morning Run",
    emoji: "🏃‍♀️",
    color: "from-violet-500 to-fuchsia-500",
    goalPerWeek: 5,
    reminders: ["06:30"],
    completions: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "habit-2",
    name: "Mindful Break",
    emoji: "🧘",
    color: "from-emerald-500 to-teal-400",
    goalPerWeek: 7,
    reminders: ["12:00", "20:00"],
    completions: [],
    createdAt: new Date().toISOString(),
  },
];

const buildDefaultHabits = () => {
  const today = getDateKey();
  return DEFAULT_HABITS.map((habit, index) => ({
    ...habit,
    completions: index === 0 ? [today] : [],
    createdAt: new Date().toISOString(),
  }));
};

const loadHabitsFromStorage = (): Habit[] => {
  if (typeof window === "undefined") {
    return buildDefaultHabits();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: Habit[] = JSON.parse(raw);
      return parsed;
    } catch {
      // ignore parse errors and fall back to defaults
    }
  }

  return buildDefaultHabits();
};

const getLastSevenDays = () => {
  const days: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < 7; i += 1) {
    days.unshift(getDateKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const computeStreak = (habit: Habit) => {
  let streak = 0;
  const completions = new Set(habit.completions);
  const today = new Date();

  while (true) {
    const key = getDateKey(today);
    if (completions.has(key)) {
      streak += 1;
      today.setDate(today.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
};

const getLongestStreak = (habit: Habit) => {
  const sorted = [...habit.completions].sort().reverse();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const date of sorted) {
    if (!previous) {
      current = 1;
      longest = Math.max(longest, current);
      previous = date;
      continue;
    }

    const prevDate = new Date(previous);
    prevDate.setDate(prevDate.getDate() - 1);
    const expected = getDateKey(prevDate);

    if (date === expected) {
      current += 1;
    } else {
      current = 1;
    }

    longest = Math.max(longest, current);
    previous = date;
  }

  return longest;
};

const getNextReminderForHabit = (habit: Habit) => {
  if (habit.reminders.length === 0) {
    return null;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...habit.reminders].sort();

  for (const time of sorted) {
    const [hour, minute] = time.split(":").map(Number);
    const reminderMinutes = hour * 60 + minute;

    if (reminderMinutes > nowMinutes) {
      return time;
    }
  }

  return sorted[0];
};

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabitsFromStorage());
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔥");
  const [goalPerWeek, setGoalPerWeek] = useState(5);
  const [reminderTime, setReminderTime] = useState("");
  const [alerts, setAlerts] = useState<ReminderAlert[]>([]);

  const reminderCacheRef = useRef<{ date: string; keys: Set<string> }>({
    date: getDateKey(),
    keys: new Set(),
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const dateKey = getDateKey(now);
      if (reminderCacheRef.current.date !== dateKey) {
        reminderCacheRef.current = { date: dateKey, keys: new Set() };
      }

      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const upcomingAlerts: ReminderAlert[] = [];

      habits.forEach((habit) => {
        habit.reminders.forEach((time) => {
          const [hour, minute] = time.split(":").map(Number);
          if (
            Number.isNaN(hour) ||
            Number.isNaN(minute) ||
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
          ) {
            return;
          }

          const targetSeconds = hour * 3600 + minute * 60;
          const delta = Math.abs(nowSeconds - targetSeconds);
          const cacheKey = `${habit.id}-${time}-${dateKey}`;

          if (delta <= 30 && !reminderCacheRef.current.keys.has(cacheKey)) {
            reminderCacheRef.current.keys.add(cacheKey);
            upcomingAlerts.push({
              id: `${cacheKey}-${now.getTime()}`,
              habitId: habit.id,
              habitName: habit.name,
              time,
              timestamp: now.getTime(),
            });
          }
        });
      });

      if (upcomingAlerts.length > 0) {
        setAlerts((prev) => [...prev, ...upcomingAlerts]);
      }
    };

    const interval = setInterval(tick, 30_000);
    tick();

    return () => clearInterval(interval);
  }, [habits]);

  const todayKey = getDateKey();

  const todayCompletionRatio = useMemo(() => {
    if (habits.length === 0) return 0;
    const completedToday = habits.filter((habit) =>
      habit.completions.includes(todayKey),
    );
    return completedToday.length / habits.length;
  }, [habits, todayKey]);

  const weeklyProgress = useMemo(() => {
    const days = getLastSevenDays();
    return days.map((day) => {
      const completed = habits.filter((habit) => habit.completions.includes(day));
      return {
        day,
        completed: completed.length,
        percentage: habits.length === 0 ? 0 : completed.length / habits.length,
      };
    });
  }, [habits]);

  const handleToggleCompletion = (habitId: string, dateKey: string) => {
    setHabits((prev) =>
      prev.map((habit) => {
        if (habit.id !== habitId) return habit;
        const completions = new Set(habit.completions);
        if (completions.has(dateKey)) {
          completions.delete(dateKey);
        } else {
          completions.add(dateKey);
        }
        return { ...habit, completions: Array.from(completions).sort() };
      }),
    );
  };

  const handleAddHabit = () => {
    if (!name.trim()) {
      return;
    }

    const color =
      GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)] ??
      "from-sky-500 to-cyan-400";

    const habit: Habit = {
      id: crypto.randomUUID(),
      name: name.trim(),
      emoji: emoji.trim() || "✨",
      color,
      goalPerWeek: goalPerWeek < 1 ? 1 : goalPerWeek,
      reminders: reminderTime ? [reminderTime] : [],
      completions: [],
      createdAt: new Date().toISOString(),
    };

    setHabits((prev) => [habit, ...prev]);
    setSelectedHabitId(habit.id);
    setName("");
    setGoalPerWeek(5);
    setReminderTime("");
  };

  const handleAddReminder = (habitId: string, time: string) => {
    if (!time) return;

    setHabits((prev) =>
      prev.map((habit) => {
        if (habit.id !== habitId) return habit;
        const reminders = Array.from(new Set([...habit.reminders, time])).sort();
        return { ...habit, reminders };
      }),
    );
  };

  const handleRemoveReminder = (habitId: string, time: string) => {
    setHabits((prev) =>
      prev.map((habit) => {
        if (habit.id !== habitId) return habit;
        return {
          ...habit,
          reminders: habit.reminders.filter((rem) => rem !== time),
        };
      }),
    );
  };

  const handleDeleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((habit) => habit.id !== habitId));
    if (selectedHabitId === habitId) {
      setSelectedHabitId(null);
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-16 pt-6 sm:max-w-2xl sm:px-6">
      <div className="sticky top-4 z-20 flex flex-col gap-3 rounded-3xl bg-zinc-900/80 p-4 backdrop-blur">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-zinc-500">
            Pulse Habits
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Stay on track, build momentum, own your day.
          </h1>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl bg-zinc-800/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Today&apos;s focus
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-4xl font-semibold text-white">
                {Math.round(todayCompletionRatio * 100)}%
              </span>
              <p className="text-sm text-zinc-400">
                {habits.length === 0
                  ? "Add your first habit"
                  : `${habits.filter((habit) =>
                      habit.completions.includes(todayKey),
                    ).length}/${habits.length} done`}
              </p>
            </div>
          </div>
          <div className="flex-1">
            <div className="mt-3 h-2 w-full rounded-full bg-zinc-700 sm:mt-0">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-purple-500 transition-all"
                style={{ width: `${Math.max(todayCompletionRatio * 100, 4)}%` }}
              />
            </div>
            <div className="mt-4 flex items-center justify-between sm:mt-2">
              {weeklyProgress.map((day) => (
                <div key={day.day} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all",
                      day.day === todayKey
                        ? "bg-sky-500/90 text-white"
                        : "bg-zinc-700/70 text-zinc-300",
                    )}
                  >
                    {new Date(day.day).toLocaleDateString([], {
                      weekday: "short",
                    }).slice(0, 2)}
                  </div>
                  <div className="h-1.5 w-8 rounded-full bg-zinc-700">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500"
                      style={{ width: `${day.percentage * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="sticky top-40 z-10 space-y-2">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => dismissAlert(alert.id)}
              className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 px-4 py-3 text-left text-sm font-medium text-white shadow-lg shadow-amber-500/20 transition hover:scale-[1.01]"
            >
              <div>
                Reminder: <span className="font-semibold">{alert.habitName}</span>{" "}
                at {alert.time}
              </div>
              <span className="opacity-75">Dismiss</span>
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-3xl bg-zinc-900/70 p-5 backdrop-blur">
        <div>
          <h2 className="text-lg font-semibold text-white">Create a habit</h2>
          <p className="text-sm text-zinc-500">
            Pick an anchor emoji, define your weekly target, and we&apos;ll keep the
            streaks alive.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-zinc-200">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Evening stretch"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-zinc-200">
            Emoji
            <input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              maxLength={2}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-center text-xl focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-zinc-200">
            Weekly target (days)
            <input
              type="number"
              min={1}
              max={7}
              value={goalPerWeek}
              onChange={(event) => setGoalPerWeek(Number(event.target.value))}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-zinc-200">
            Optional reminder
            <input
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
        </div>
        <button
          onClick={handleAddHabit}
          className="mt-2 flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:scale-[1.01] active:scale-[0.99]"
        >
          Add habit
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Today&apos;s rhythm</h2>
        <div className="flex flex-col gap-4">
          {habits.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-700/60 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-500">
              No habits yet. Add your first routine and we&apos;ll start tracking streaks.
            </div>
          ) : (
            habits.map((habit) => {
              const completedToday = habit.completions.includes(todayKey);
              const streak = computeStreak(habit);
              const longest = getLongestStreak(habit);
              const nextReminder = getNextReminderForHabit(habit);

              return (
                <button
                  key={habit.id}
                  onClick={() =>
                    setSelectedHabitId((current) =>
                      current === habit.id ? null : habit.id,
                    )
                  }
                  className={cn(
                    "group flex flex-col gap-4 rounded-3xl p-4 text-left shadow-lg shadow-black/20 transition hover:scale-[1.01]",
                    "bg-zinc-900/80 ring-1 ring-inset ring-zinc-800/70",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl",
                        habit.color,
                      )}
                    >
                      {habit.emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-white">
                            {habit.name}
                          </p>
                          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                            {streak > 0 ? `${streak}-day streak` : "Let&apos;s begin"}
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                          <input
                            type="checkbox"
                            checked={completedToday}
                            onChange={() =>
                              handleToggleCompletion(habit.id, todayKey)
                            }
                            className="h-5 w-5 rounded border-2 border-zinc-600 bg-transparent accent-sky-500 transition"
                            onClick={(event) => event.stopPropagation()}
                          />
                          Done
                        </label>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                        <span>
                          Target {habit.goalPerWeek}x weekly · Longest streak {longest}
                          d
                        </span>
                        {nextReminder && (
                          <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-1 text-[11px] text-sky-300">
                            Next reminder {nextReminder}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedHabitId === habit.id && (
                    <div className="space-y-4 rounded-2xl bg-zinc-950/60 p-4 text-sm text-zinc-300">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                          Weekly check-in
                        </p>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteHabit(habit.id);
                          }}
                          className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-center text-xs">
                        {getLastSevenDays().map((day) => {
                          const isCompleted = habit.completions.includes(day);
                          const date = new Date(day);
                          const label = date.toLocaleDateString([], {
                            weekday: "short",
                          });
                          return (
                            <button
                              key={day}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleCompletion(habit.id, day);
                              }}
                              className={cn(
                                "flex h-12 flex-col items-center justify-center rounded-2xl border text-[11px] font-medium transition",
                                isCompleted
                                  ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                                  : "border-zinc-700/60 bg-zinc-900/80 text-zinc-500 hover:border-sky-500/40 hover:text-sky-200",
                              )}
                            >
                              <span>{label.slice(0, 2)}</span>
                              <span>{date.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                          Reminders
                        </p>
                        {habit.reminders.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No reminders yet. Add a time to nudge your future self.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {habit.reminders.map((time) => (
                              <button
                                key={time}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveReminder(habit.id, time);
                                }}
                                className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/30"
                              >
                                {time}
                                <span className="text-emerald-300/70">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value) {
                                handleAddReminder(habit.id, value);
                                event.target.value = "";
                              }
                            }}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                          />
                          <span className="text-xs text-zinc-500">
                            Tap to add time
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </section>

      <footer className="mb-8 mt-auto text-center text-xs text-zinc-500">
        Built to feel right at home on your phone. Your data stays on this device.
      </footer>
    </div>
  );
}
