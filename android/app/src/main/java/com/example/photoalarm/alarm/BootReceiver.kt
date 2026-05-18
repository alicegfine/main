package com.example.photoalarm.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.photoalarm.data.AlarmRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val alarms = AlarmRepository(context).getEnabled()
                AlarmScheduler.rescheduleAll(context, alarms)
            } finally {
                pending.finish()
            }
        }
    }
}
