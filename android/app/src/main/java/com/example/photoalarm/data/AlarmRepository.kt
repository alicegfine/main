package com.example.photoalarm.data

import android.content.Context
import kotlinx.coroutines.flow.Flow

class AlarmRepository(context: Context) {
    private val dao = AlarmDatabase.get(context).alarmDao()

    fun observeAll(): Flow<List<Alarm>> = dao.observeAll()
    suspend fun getEnabled(): List<Alarm> = dao.getEnabled()
    suspend fun getById(id: Long): Alarm? = dao.getById(id)
    suspend fun upsert(alarm: Alarm): Long =
        if (alarm.id == 0L) dao.insert(alarm) else { dao.update(alarm); alarm.id }
    suspend fun delete(alarm: Alarm) = dao.delete(alarm)
}
