/**
 * Fades out and removes the static #boot-splash from index.html.
 *
 * Intentionally NOT called on a fixed timer after React paints - painting
 * alone still shows the dashboard's own empty "0 fixtures / waiting"
 * shell underneath, since the first data fetch hasn't resolved yet. Call
 * this once App's first loadDashboard() attempt has actually settled
 * (success or error - either way there's real content, honest or not,
 * behind the splash). See the safety-net timeout in main.tsx for the
 * fallback if that signal never arrives.
 */
let hidden = false;

export function hideBootSplash() {
  if (hidden) return;
  hidden = true;

  const splash = document.getElementById("boot-splash");
  if (!splash) return;

  splash.classList.add("boot-splash-hide");
  window.setTimeout(() => splash.remove(), 400);
}
