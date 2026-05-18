package com.example.photoalarm.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
                AlarmTrigger.fireNow(context, alarmId)

                // Re-arm: repeating alarms roll to the next valid weekday,
                // one-shots turn themselves off so the user gets a clean state.
                val repo = AlarmRepository(context)
                val alarm = repo.getById(alarmId) ?: return@launch
                if (alarm.daysOfWeek == 0) {
                    repo.upsert(alarm.copy(enabled = false))
                    AlarmScheduler.cancel(context, alarmId)
                } else if (alarm.enabled) {
                    AlarmScheduler.schedule(context, alarm)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
