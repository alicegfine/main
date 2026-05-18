package com.example.photoalarm.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.example.photoalarm.data.AlarmRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = AlarmScheduler.alarmIdFromIntent(intent)
        if (alarmId < 0) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val repo = AlarmRepository(context)
                val alarm = repo.getById(alarmId)
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

                // Re-arm for the next occurrence.
                if (alarm != null && alarm.enabled) {
                    AlarmScheduler.schedule(context, alarm)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
