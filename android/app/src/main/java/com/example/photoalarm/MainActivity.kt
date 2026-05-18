package com.example.photoalarm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.photoalarm.ui.AlarmEditScreen
import com.example.photoalarm.ui.AlarmListScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                val nav = rememberNavController()
                NavHost(navController = nav, startDestination = "list") {
                    composable("list") {
                        AlarmListScreen(
                            onEdit = { id -> nav.navigate("edit/$id") },
                            onNew = { nav.navigate("edit/0") },
                        )
                    }
                    composable("edit/{id}") { backStack ->
                        val id = backStack.arguments?.getString("id")?.toLongOrNull() ?: 0L
                        AlarmEditScreen(
                            alarmId = id,
                            onDone = { nav.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}
