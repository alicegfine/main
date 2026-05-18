package com.example.photoalarm.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * Foreground service that owns the actual alarm sound. Stays silent during
 * a grace period so you can stumble to the target before the apartment
 * wakes up, then ramps up.
 */
class AlarmSoundService : Service() {

    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var alarmId: Long = -1L
    private var startedAt: Long = 0L
    private var graceMs: Int = 120_000

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "photoalarm:sound").apply {
            setReferenceCounted(false)
            acquire(15 * 60_000L)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        alarmId = intent?.getLongExtra(EXTRA_ALARM_ID, -1L) ?: -1L
        graceMs = (intent?.getIntExtra(EXTRA_GRACE_SECONDS, 120) ?: 120) * 1000
        startedAt = SystemClock.elapsedRealtime()

        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Alarm")
            .setContentText("Take a matching photo to dismiss")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(openAlarmActivity())
            .setFullScreenIntent(openAlarmActivity(), true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIF_ID, notif)
        }

        // Schedule the sound to start after the grace period.
        handler.postDelayed(::startRinging, graceMs.toLong())
        return START_NOT_STICKY
    }

    private fun startRinging() {
        if (player != null) return
        val uri: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(this@AlarmSoundService, uri)
            isLooping = true
            prepare()
            start()
        }
        // Make sure the alarm stream is audible even if it was muted.
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        am.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.8f).toInt(), 0)

        // Vibrate.
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(VIBRATOR_SERVICE) as Vibrator
        }
        val pattern = longArrayOf(0, 800, 400)
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        player?.runCatching { stop() }
        player?.release()
        player = null
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.cancel()
        wakeLock?.runCatching { if (isHeld) release() }
        wakeLock = null
        super.onDestroy()
    }

    /** Seconds of grace remaining (negative if the sound has already started). */
    fun secondsUntilSound(): Int =
        ((graceMs - (SystemClock.elapsedRealtime() - startedAt)) / 1000).toInt()

    private fun openAlarmActivity(): PendingIntent {
        val i = Intent(this, AlarmActivity::class.java).apply {
            putExtra(AlarmActivity.EXTRA_ALARM_ID, alarmId)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return PendingIntent.getActivity(
            this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "Active alarms",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Shows while a PhotoAlarm is ringing"
            setBypassDnd(true)
            setSound(null, null) // sound is handled by MediaPlayer
        }
        nm.createNotificationChannel(ch)
    }

    companion object {
        const val EXTRA_ALARM_ID = "alarm_id"
        const val EXTRA_GRACE_SECONDS = "grace_seconds"
        private const val CHANNEL_ID = "photoalarm.active"
        private const val NOTIF_ID = 4242

        fun stop(context: Context) {
            context.stopService(Intent(context, AlarmSoundService::class.java))
        }
    }
}
