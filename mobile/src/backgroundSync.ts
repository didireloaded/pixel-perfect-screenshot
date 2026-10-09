import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { syncQueue } from "./offlineQueue";
const TASK = "shiftline-attendance-sync";
TaskManager.defineTask(TASK, async () => {
  try {
    const result = await syncQueue();
    const permission = await Notifications.getPermissionsAsync();
    if (permission.granted && result.synced > 0)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Attendance synced",
          body: "Your saved attendance actions were uploaded.",
        },
        trigger: null,
      });
    if (permission.granted && result.review > 0)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Attendance needs review",
          body: "A saved action needs your manager’s review.",
        },
        trigger: null,
      });
    return result.retrying
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
export async function enableBackgroundSync() {
  const available = await BackgroundTask.getStatusAsync();
  if (available !== BackgroundTask.BackgroundTaskStatus.Available)
    throw new Error("Background sync is unavailable. Actions will sync when the app is open.");
  if (!(await TaskManager.isTaskRegisteredAsync(TASK)))
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  await Notifications.requestPermissionsAsync();
}
export async function stopBackgroundSync() {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
}
