package com.example.photoalarm

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class PhotoAlarmApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(
                    "photoalarm.active",
                    "Active alarms",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply { setBypassDnd(true); setSound(null, null) }
            )
        }
    }
}
