package com.example.photoalarm.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.example.photoalarm.data.Alarm
import java.util.Calendar

object AlarmScheduler {

    private const val EXTRA_ALARM_ID = "alarm_id"

    fun schedule(context: Context, alarm: Alarm) {
        if (!alarm.enabled) return
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerAt = nextTrigger(alarm)
        val pending = pendingIntent(context, alarm.id, create = true)

        val info = AlarmManager.AlarmClockInfo(triggerAt, openAppPending(context))
        // AlarmClockInfo bypasses Doze and is the highest-priority alarm tier.
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setAlarmClock(info, pending)
        } else {
            // Fallback for devices that revoked SCHEDULE_EXACT_ALARM.
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
        }
    }

    fun cancel(context: Context, alarmId: Long) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(context, alarmId, create = true))
    }

    fun rescheduleAll(context: Context, alarms: List<Alarm>) {
        for (a in alarms) if (a.enabled) schedule(context, a) else cancel(context, a.id)
    }

    fun alarmIdFromIntent(intent: Intent): Long = intent.getLongExtra(EXTRA_ALARM_ID, -1L)

    private fun pendingIntent(context: Context, alarmId: Long, create: Boolean): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra(EXTRA_ALARM_ID, alarmId)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, alarmId.toInt(), intent, flags)
    }

    private fun openAppPending(context: Context): PendingIntent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)!!
        return PendingIntent.getActivity(
            context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun nextTrigger(alarm: Alarm): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, alarm.hour)
            set(Calendar.MINUTE, alarm.minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (alarm.daysOfWeek == 0) {
            if (target.timeInMillis <= now.timeInMillis) target.add(Calendar.DAY_OF_YEAR, 1)
            return target.timeInMillis
        }
        // Walk forward up to 7 days until we hit an enabled weekday.
        for (i in 0..7) {
            val test = target.clone() as Calendar
            test.add(Calendar.DAY_OF_YEAR, i)
            if (test.timeInMillis <= now.timeInMillis) continue
            val dow = test.get(Calendar.DAY_OF_WEEK) // Sun=1..Sat=7
            val bit = when (dow) {
                Calendar.MONDAY -> 1; Calendar.TUESDAY -> 2; Calendar.WEDNESDAY -> 4
                Calendar.THURSDAY -> 8; Calendar.FRIDAY -> 16; Calendar.SATURDAY -> 32
                Calendar.SUNDAY -> 64; else -> 0
            }
            if (alarm.daysOfWeek and bit != 0) return test.timeInMillis
        }
        return target.timeInMillis
    }
}
