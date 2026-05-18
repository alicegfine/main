package com.example.photoalarm.alarm

import android.content.Context
import android.content.Intent
import android.os.Build
import com.example.photoalarm.data.AlarmRepository

/**
 * Shared "fire this alarm right now" path used by both AlarmReceiver (when
 * AlarmManager wakes us up) and the Test-now button in the edit screen.
 */
object AlarmTrigger {
    suspend fun fireNow(context: Context, alarmId: Long) {
        val alarm = AlarmRepository(context).getById(alarmId)
        val grace = alarm?.graceSeconds ?: 120

        val serviceIntent = Intent(context, AlarmSoundService::class.java).apply {
            putExtra(AlarmSoundService.EXTRA_ALARM_ID, alarmId)
            putExtra(AlarmSoundService.EXTRA_GRACE_SECONDS, grace)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        val ui = Intent(context, AlarmActivity::class.java).apply {
            putExtra(AlarmActivity.EXTRA_ALARM_ID, alarmId)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        }
        context.startActivity(ui)
    }
}
