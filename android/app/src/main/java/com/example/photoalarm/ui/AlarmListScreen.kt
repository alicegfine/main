package com.example.photoalarm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.photoalarm.alarm.AlarmScheduler
import com.example.photoalarm.data.Alarm
import com.example.photoalarm.data.AlarmRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectAsState
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlarmListScreen(onEdit: (Long) -> Unit, onNew: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { AlarmRepository(context) }
    val alarms by repo.observeAll().flowOn(Dispatchers.IO).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = { TopAppBar(title = { Text("PhotoAlarm") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = onNew) {
                Icon(Icons.Default.Add, contentDescription = "New alarm")
            }
        }
    ) { padding ->
        if (alarms.isEmpty()) {
            Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No alarms yet. Tap + to add one.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                items(alarms, key = { it.id }) { alarm ->
                    AlarmRow(
                        alarm = alarm,
                        onClick = { onEdit(alarm.id) },
                        onToggle = { enabled ->
                            scope.launch(Dispatchers.IO) {
                                repo.upsert(alarm.copy(enabled = enabled))
                                if (enabled) AlarmScheduler.schedule(context, alarm.copy(enabled = true))
                                else AlarmScheduler.cancel(context, alarm.id)
                            }
                        }
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun AlarmRow(alarm: Alarm, onClick: () -> Unit, onToggle: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "%02d:%02d".format(alarm.hour, alarm.minute),
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold
            )
            val sub = buildString {
                if (alarm.label.isNotBlank()) append(alarm.label).append(" • ")
                append(formatRepeatDays(alarm.daysOfWeek)).append(" • ")
                append(if (alarm.targetImagePath != null) "Target set" else "No target")
                append(" • ").append("${alarm.graceSeconds}s grace")
            }
            Text(sub, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }
        Switch(checked = alarm.enabled, onCheckedChange = onToggle)
    }
}

private fun formatRepeatDays(mask: Int): String {
    if (mask == 0) return "One-shot"
    if (mask == 0b1111111) return "Every day"
    if (mask == 0b0011111) return "Weekdays"
    if (mask == 0b1100000) return "Weekends"
    val letters = listOf("M" to 1, "T" to 2, "W" to 4, "T" to 8, "F" to 16, "S" to 32, "S" to 64)
    return letters.filter { (mask and it.second) != 0 }.joinToString("") { it.first }
}
