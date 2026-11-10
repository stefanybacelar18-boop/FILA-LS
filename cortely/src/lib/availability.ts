import { addMinutesToTime, timeToMinutes } from "@/lib/utils";
import type { Appointment, WorkingHours } from "@/lib/types";

export function buildAvailableSlots(params: {
  workingHours: WorkingHours[];
  appointments: Appointment[];
  dateISO: string;
  durationMinutes: number;
  slotStepMinutes?: number;
}) {
  const { workingHours, appointments, dateISO, durationMinutes } = params;
  const step = params.slotStepMinutes ?? 15;
  const day = new Date(`${dateISO}T12:00:00`).getDay();
  const windows = workingHours.filter((w) => w.day_of_week === day);

  if (!windows.length) return [] as string[];

  const busy = appointments
    .filter((a) => a.appointment_date === dateISO && a.status !== "canceled")
    .map((a) => ({
      start: timeToMinutes(a.start_time.slice(0, 5)),
      end: timeToMinutes(a.end_time.slice(0, 5)),
    }));

  const slots: string[] = [];

  for (const window of windows) {
    const start = timeToMinutes(window.start_time.slice(0, 5));
    const end = timeToMinutes(window.end_time.slice(0, 5));
    const breakStart = window.break_start
      ? timeToMinutes(window.break_start.slice(0, 5))
      : null;
    const breakEnd = window.break_end
      ? timeToMinutes(window.break_end.slice(0, 5))
      : null;

    for (let t = start; t + durationMinutes <= end; t += step) {
      const slotEnd = t + durationMinutes;
      const inBreak =
        breakStart !== null &&
        breakEnd !== null &&
        t < breakEnd &&
        slotEnd > breakStart;
      if (inBreak) continue;

      const overlaps = busy.some((b) => t < b.end && slotEnd > b.start);
      if (overlaps) continue;

      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }

  return slots;
}

export function computeEndTime(startTime: string, durationMinutes: number) {
  return addMinutesToTime(startTime.slice(0, 5), durationMinutes);
}
