package com.example.photoalarm.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "alarms")
data class Alarm(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val label: String = "",
    val hour: Int,
    val minute: Int,
    val enabled: Boolean = true,
    /** Days of week as bitmask, Mon=1, Sun=64. 0 = one-shot. */
    val daysOfWeek: Int = 0,
    /** Path on disk to the reference photo. Null until the user picks one. */
    val targetImagePath: String? = null,
    /** Cosine-similarity threshold required to dismiss, 0..1. */
    val similarityThreshold: Float = 0.75f,
    /** Seconds of quiet "grace" time after the alarm fires before sound starts. */
    val graceSeconds: Int = 120,
)
