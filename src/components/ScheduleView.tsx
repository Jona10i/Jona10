import React, { useState, useEffect, useMemo } from "react";
import { useFirebase } from "./FirebaseProvider";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Meeting, Reminder, User } from "../types";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle,
  Circle,
  ArrowLeft,
  Video,
  Settings,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import {
  isFuture,
  isToday,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { cn, formatDate as format } from "../lib/utils";
import { useTranslation } from "react-i18next";
import { auth } from "../lib/firebase";
import { motion } from "motion/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function handleFirestoreError(
  error: unknown,
  operationType: string,
  path: string | null,
) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  // Do not rethrow: log and continue. Throwing from listener error callbacks
  // crashes the app via ErrorBoundary on transient errors (ported from upstream).
}

const meetingOccursOnDay = (meeting: Meeting, day: Date): boolean => {
  const startTime = new Date(meeting.startTime);
  if (isSameDay(startTime, day)) return true;
  if (!meeting.recurrence || meeting.recurrence === "none") return false;
  if (day.getTime() < meeting.startTime) return false;

  if (meeting.recurrence === "daily") return true;
  if (meeting.recurrence === "weekly")
    return day.getDay() === startTime.getDay();
  if (meeting.recurrence === "monthly")
    return day.getDate() === startTime.getDate();
  return false;
};

export const ScheduleView: React.FC = () => {
  const { user, profile, accessToken, signIn } = useFirebase();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<
    "meetings" | "reminders" | "calendar"
  >("meetings");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Data
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Modals
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Forms
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [platform, setPlatform] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [searchAttendees, setSearchAttendees] = useState("");
  const [recurrence, setRecurrence] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >("none");
  const [sendInvite, setSendInvite] = useState(false);

  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderPriority, setReminderPriority] = useState<
    "low" | "medium" | "high"
  >("medium");

  // Auto-delete meetings older than 72 hours
  useEffect(() => {
    if (!user || meetings.length === 0) return;
    const now = Date.now();
    const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;
    
    meetings.forEach((m) => {
      if (m.endTime < now - SEVENTY_TWO_HOURS) {
        if (m.organizerId === user.uid || profile?.role === 'admin') {
          deleteDoc(doc(db, 'meetings', m.id)).catch(console.error);
        }
      }
    });
  }, [meetings, user, profile]);

  useEffect(() => {
    if (!user) return;

    const unsubs: any[] = [];

    // Meetings
    const qMeetings = query(
      collection(db, "meetings"),
      orderBy("startTime", "asc"),
    );
    unsubs.push(
      onSnapshot(
        qMeetings,
        (snap) => {
          setMeetings(
            snap.docs
              .map((doc) => ({ id: doc.id, ...doc.data() }) as Meeting)
              .filter((m) => m.companyName === profile?.companyName),
          );
        },
        (error) => console.error("Error fetching meetings", error),
      ),
    );

    // Reminders
    const qReminders = query(
      collection(db, `users/${user.uid}/reminders`),
      orderBy("notifyTime", "asc"),
    );
    unsubs.push(
      onSnapshot(
        qReminders,
        (snap) => {
          setReminders(
            snap.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                priority: data.priority || "medium",
              } as Reminder;
            }),
          );
        },
        (error) => console.error("Error fetching reminders", error),
      ),
    );

    // Users
    const qUsers = query(collection(db, "users"));
    unsubs.push(
      onSnapshot(qUsers, (snap) => {
        setUsers(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as User)
            .filter((u) => u.companyName === profile?.companyName),
        );
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [user, profile]);

  // Actions
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const start = new Date(`${startDate}T${startTimeStr}`).getTime();
      const end = new Date(`${startDate}T${endTimeStr}`).getTime();

      await addDoc(collection(db, "meetings"), {
        title,
        description,
        startTime: start,
        endTime: end,
        organizerId: user.uid,
        attendees: [user.uid, ...attendees],
        platform,
        createdAt: Date.now(),
        recurrence,
        companyName: profile?.companyName || '',
      });

      if (sendInvite && attendees.length > 0) {
        if (!accessToken) {
          try {
            if (
              window.confirm(
                "You need to authenticate with Google to send invite emails. Sign in now?",
              )
            ) {
              await signIn();
              alert(
                "Authentication complete. However we cannot send the email for this meeting without reloading permissions. Please re-authenticate ahead of time for future meetings.",
              );
            }
          } catch (err) {
            console.error(err);
          }
        } else {
          setIsSending(true);
          try {
            const attendeeUsers = users.filter((u) => attendees.includes(u.id));
            const emails = attendeeUsers.map((u) => u.email).filter(Boolean);
            if (emails.length > 0) {
              const emailTo = emails.join(", ");
              const emailContent = `To: ${emailTo}\nSubject: Meeting Invitation: ${title}\nContent-Type: text/plain; charset="UTF-8"\n\nYou have been invited to a meeting: ${title}\n\nDate: ${startDate}\nTime: ${startTimeStr} - ${endTimeStr}\nPlatform: ${platform || "Not specified"}\n\nDescription:\n${description || "No description provided."}\n`;

              const encodedEmail = btoa(
                unescape(encodeURIComponent(emailContent)),
              )
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

              await fetch(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ raw: encodedEmail }),
                },
              );
            }
          } catch (err) {
            console.error("Error sending email:", err);
            alert("Failed to send invite emails.");
          } finally {
            setIsSending(false);
          }
        }
      }

      setShowMeetingModal(false);
      setTitle("");
      setDescription("");
      setStartDate("");
      setStartTimeStr("");
      setEndTimeStr("");
      setPlatform("");
      setAttendees([]);
      setRecurrence("none");
      setSendInvite(false);
    } catch (e) {
      handleFirestoreError(e, "create", "meetings");
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const notify = new Date(`${reminderDate}T${reminderTime}`).getTime();

      await addDoc(collection(db, `users/${user.uid}/reminders`), {
        userId: user.uid,
        title: reminderTitle,
        notifyTime: notify,
        completed: false,
        priority: reminderPriority,
        notified: false,
        createdAt: Date.now(),
      });
      setShowReminderModal(false);
      setReminderTitle("");
      setReminderDate("");
      setReminderTime("");
      setReminderPriority("medium");
    } catch (e) {
      handleFirestoreError(e, "create", `users/${user.uid}/reminders`);
    }
  };

  const toggleReminder = async (id: string, completed: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/reminders`, id), {
        completed: !completed,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        "update",
        `users/${user.uid}/reminders/${id}`,
      );
    }
  };

  const deleteMeeting = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "meetings", id));
    } catch (error) {
      handleFirestoreError(error, "delete", `meetings/${id}`);
    }
  };

  const deleteReminder = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/reminders`, id));
    } catch (error) {
      handleFirestoreError(
        error,
        "delete",
        `users/${user.uid}/reminders/${id}`,
      );
    }
  };

  const monthlyDistributionData = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    return days.map((day) => {
      const dayMeetingsCount = meetings.filter((m) =>
        meetingOccursOnDay(m, day),
      ).length;
      return {
        dateLabel: format(day, "MMM dd"),
        meetings: dayMeetingsCount,
      };
    });
  }, [currentMonth, meetings]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
      <div className="px-6 py-4 border-b border-slate-200 bg-white shadow-sm z-10 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-workspace-accent" />
          Schedule & Reminders
        </h2>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("meetings")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
              activeTab === "meetings"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Meetings
          </button>
          <button
            onClick={() => setActiveTab("reminders")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
              activeTab === "reminders"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Reminders
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
              activeTab === "calendar"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Calendar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === "meetings" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  Upcoming Meetings
                </h3>
                <button
                  onClick={() => setShowMeetingModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-workspace-accent text-white rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Meeting
                </button>
              </div>

              {meetings.filter((m) => m.endTime > Date.now()).length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Video className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="text-slate-500 font-medium">
                    No upcoming meetings scheduled.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {meetings
                    .filter((m) => m.endTime > Date.now())
                    .map((meeting) => (
                      <div
                        key={meeting.id}
                        className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4"
                      >
                        <div className="bg-blue-50 text-blue-600 px-4 py-3 rounded-xl text-center min-w-[80px]">
                          <p className="text-sm font-bold">
                            {format(meeting.startTime, "MMM")}
                          </p>
                          <p className="text-2xl font-black">
                            {format(meeting.startTime, "d")}
                          </p>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-lg font-bold text-slate-900">
                                {meeting.title}
                              </h4>
                              <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {format(meeting.startTime, "h:mm a")} -{" "}
                                {format(meeting.endTime, "h:mm a")}
                                {meeting.platform && (
                                  <>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                    <Video className="w-4 h-4 ml-1" />{" "}
                                    {meeting.platform}
                                  </>
                                )}
                              </p>
                            </div>
                            {(meeting.organizerId === user?.uid ||
                              profile?.role === "admin") && (
                              <button
                                onClick={() => deleteMeeting(meeting.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {meeting.description && (
                            <p className="mt-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">
                              {meeting.description}
                            </p>
                          )}
                          <div className="mt-4 flex -space-x-2">
                            {meeting.attendees.map((attendeeId) => {
                              const attUser = users.find(
                                (u) => u.id === attendeeId,
                              );
                              if (!attUser) return null;
                              return (
                                <img
                                  key={attendeeId}
                                  src={
                                    attUser.avatar ||
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(attUser.name)}&background=random`
                                  }
                                  className="w-8 h-8 rounded-full border-2 border-white bg-slate-200"
                                  title={attUser.name}
                                  alt={attUser.name}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : activeTab === "calendar" ? (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4 px-1">
                  {t(
                    "schedule.monthlyDistribution",
                    "Monthly Meeting Distribution",
                  )}
                </h3>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyDistributionData}
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="dateLabel"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          boxShadow:
                            "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: "#0f172a",
                        }}
                      />
                      <Bar
                        dataKey="meetings"
                        name="Meetings"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-900">
                    {format(currentMonth, "MMMM yyyy")}
                  </h3>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() =>
                        setCurrentMonth(subMonths(currentMonth, 1))
                      }
                      className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => setCurrentMonth(new Date())}
                      className="px-2 py-1.5 hover:bg-white rounded-md text-xs font-bold text-slate-600 transition-all shadow-sm"
                    >
                      Today
                    </button>
                    <button
                      onClick={() =>
                        setCurrentMonth(addMonths(currentMonth, 1))
                      }
                      className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                      <div
                        key={day}
                        className="text-center text-xs font-bold text-slate-400 py-2"
                      >
                        {day}
                      </div>
                    ),
                  )}
                  {eachDayOfInterval({
                    start: startOfWeek(startOfMonth(currentMonth)),
                    end: endOfWeek(endOfMonth(currentMonth)),
                  }).map((day, i) => {
                    const dayMeetings = meetings.filter((m) =>
                      meetingOccursOnDay(m, day),
                    );
                    const dayReminders = reminders.filter((r) =>
                      isSameDay(r.notifyTime, day),
                    );
                    return (
                      <div
                        key={i}
                        className={cn(
                          "min-h-[100px] border p-2 rounded-xl transition-all",
                          !isSameMonth(day, currentMonth)
                            ? "opacity-30 border-slate-50"
                            : "bg-slate-50 border-slate-100",
                          isToday(day)
                            ? "ring-2 ring-workspace-accent ring-inset"
                            : "",
                        )}
                      >
                        <p
                          className={cn(
                            "text-xs font-bold",
                            isToday(day)
                              ? "text-workspace-accent"
                              : "text-slate-700",
                          )}
                        >
                          {format(day, "d")}
                        </p>
                        <div className="mt-1 space-y-1">
                          {dayMeetings.map((m) => (
                            <div
                              key={m.id}
                              className="bg-blue-50 p-1 rounded-lg mb-1"
                            >
                              <p className="text-[10px] font-bold text-blue-700 truncate">
                                {m.title}
                              </p>
                              <div className="flex -space-x-1 mt-0.5">
                                {m.attendees.slice(0, 3).map((attendeeId) => {
                                  const attUser = users.find(
                                    (u) => u.id === attendeeId,
                                  );
                                  if (!attUser) return null;
                                  return (
                                    <img
                                      key={attendeeId}
                                      src={
                                        attUser.avatar ||
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(attUser.name)}&background=random`
                                      }
                                      className="w-4 h-4 rounded-full border border-white"
                                      title={attUser.name}
                                      alt={attUser.name}
                                    />
                                  );
                                })}
                                {m.attendees.length > 3 && (
                                  <div className="w-4 h-4 rounded-full border border-white bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600">
                                    +{m.attendees.length - 3}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {dayReminders.map((r) => (
                            <div
                              key={r.id}
                              className={cn(
                                "text-[10px] px-1 rounded truncate font-bold flex items-center gap-1",
                                r.priority === "high"
                                  ? "bg-rose-100 text-rose-700"
                                  : r.priority === "medium"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700",
                              )}
                            >
                              <button
                                onClick={() =>
                                  toggleReminder(r.id, r.completed)
                                }
                                className="shrink-0"
                              >
                                {r.completed ? (
                                  <CheckCircle className="w-2 h-2" />
                                ) : (
                                  <Circle className="w-2 h-2" />
                                )}
                              </button>
                              <span
                                className={
                                  r.completed ? "line-through opacity-70" : ""
                                }
                              >
                                {r.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  My Reminders
                </h3>
                <button
                  onClick={() => setShowReminderModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Add Reminder
                </button>
              </div>

              {reminders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-slate-500 font-medium">
                    No reminders right now.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {reminders.map((reminder) => {
                    const isOverdue =
                      !reminder.completed && reminder.notifyTime < Date.now();
                    return (
                      <div
                        key={reminder.id}
                        className={cn(
                          "bg-white p-4 rounded-2xl border shadow-sm flex items-center gap-4 transition-all",
                          reminder.completed
                            ? "border-slate-100 opacity-60"
                            : isOverdue
                              ? "border-rose-200"
                              : "border-slate-100 hover:border-emerald-200",
                        )}
                      >
                        <button
                          onClick={() =>
                            toggleReminder(reminder.id, reminder.completed)
                          }
                          className={cn(
                            "text-slate-300 hover:text-emerald-500 transition-colors",
                            reminder.completed && "text-emerald-500",
                          )}
                        >
                          {reminder.completed ? (
                            <CheckCircle className="w-6 h-6" />
                          ) : (
                            <Circle className="w-6 h-6" />
                          )}
                        </button>
                        <div className="flex-1">
                          <motion.p
                            initial={false}
                            animate={{ opacity: reminder.completed ? 0.5 : 1 }}
                            className={cn(
                              "font-bold text-slate-800 transition-all duration-300",
                              reminder.completed &&
                                "line-through text-slate-500",
                            )}
                          >
                            {reminder.title}
                          </motion.p>
                          <div className="flex items-center gap-2 mt-1">
                            <p
                              className={cn(
                                "text-xs font-medium",
                                isOverdue && !reminder.completed
                                  ? "text-rose-500"
                                  : "text-slate-400",
                              )}
                            >
                              {format(reminder.notifyTime, "MMM d, h:mm a")}
                            </p>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                reminder.priority === "high"
                                  ? "bg-rose-100 text-rose-600"
                                  : reminder.priority === "medium"
                                    ? "bg-amber-100 text-amber-600"
                                    : "bg-emerald-100 text-emerald-600",
                              )}
                            >
                              {reminder.priority}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteReminder(reminder.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showMeetingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">
                Schedule Meeting
              </h2>
              <button
                onClick={() => setShowMeetingModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto w-full box-border">
              <form onSubmit={handleCreateMeeting} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 max-w-full">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent font-medium text-slate-800"
                    placeholder="e.g. Weekly Standup"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={startTimeStr}
                      onChange={(e) => setStartTimeStr(e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={endTimeStr}
                      onChange={(e) => setEndTimeStr(e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Platform / Link (Optional)
                  </label>
                  <input
                    type="text"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent"
                    placeholder="e.g. Google Meet, Zoom..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent min-h-[80px]"
                    placeholder="Meeting agenda..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recurrence
                  </label>
                  <select
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(
                        e.target.value as
                          | "none"
                          | "daily"
                          | "weekly"
                          | "monthly",
                      )
                    }
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-workspace-accent"
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Invite Attendees
                  </label>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchAttendees}
                      onChange={(e) => setSearchAttendees(e.target.value)}
                      placeholder="Search users..."
                      className="w-full bg-slate-50 border-none rounded-xl pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-workspace-accent"
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl space-y-1 p-1">
                    {users
                      .filter(
                        (u) =>
                          u.id !== user?.uid &&
                          (u.name || "")
                            .toLowerCase()
                            .includes((searchAttendees || "").toLowerCase()),
                      )
                      .map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={attendees.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setAttendees([...attendees, u.id]);
                              else
                                setAttendees(
                                  attendees.filter((id) => id !== u.id),
                                );
                            }}
                            className="rounded text-workspace-accent border-slate-300 focus:ring-workspace-accent"
                          />
                          <div className="flex items-center gap-2">
                            <img
                              src={
                                u.avatar ||
                                `https://ui-avatars.com/api/?name=${u.name}`
                              }
                              className="w-6 h-6 rounded-full"
                              alt=""
                            />
                            <span className="text-sm font-medium text-slate-700">
                              {u.name}
                            </span>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    id="sendInviteCheckbox"
                    checked={sendInvite}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        if (!accessToken) {
                          const wantToSignIn = window.confirm(
                            "Sending emails requires connecting your Google Workspace account. Connect now?",
                          );
                          if (wantToSignIn) {
                            try {
                              await signIn();
                              setSendInvite(true);
                            } catch (err) {
                              console.error(err);
                              setSendInvite(false);
                            }
                          } else {
                            setSendInvite(false);
                          }
                        } else {
                          setSendInvite(true);
                        }
                      } else {
                        setSendInvite(false);
                      }
                    }}
                    className="w-4 h-4 text-workspace-accent rounded border-slate-300 focus:ring-workspace-accent"
                  />
                  <label
                    htmlFor="sendInviteCheckbox"
                    className="text-sm font-bold text-slate-700 cursor-pointer"
                  >
                    Send Invite via Email
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={
                      isSending ||
                      !title ||
                      !startDate ||
                      !startTimeStr ||
                      !endTimeStr
                    }
                    className="w-full bg-workspace-accent text-white font-bold rounded-xl p-3 hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isSending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Schedule Meeting"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showReminderModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Add Reminder</h2>
              <button
                onClick={() => setShowReminderModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 w-full box-border">
              <form onSubmit={handleCreateReminder} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 max-w-full">
                    What to remember?
                  </label>
                  <input
                    type="text"
                    required
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800"
                    placeholder="e.g. Follow up with client"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      required
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={reminderPriority}
                    onChange={(e) =>
                      setReminderPriority(
                        e.target.value as "low" | "medium" | "high",
                      )
                    }
                    className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={!reminderTitle || !reminderDate || !reminderTime}
                    className="w-full bg-emerald-500 text-white font-bold rounded-xl p-3 hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Set Reminder
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
