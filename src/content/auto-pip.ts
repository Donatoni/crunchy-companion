/**
 * Auto Picture-in-Picture: when the user switches away from the Crunchyroll tab
 * while an episode is playing, pop the <video> out into a floating PiP window so
 * they can keep watching in the corner. Returning to the tab closes the window
 * again — but only if we were the ones who opened it, so we never fight a PiP
 * the user opened themselves via the native button.
 *
 * Chrome allows requestPictureInPicture() without a fresh user gesture during the
 * visibility→hidden transition as long as the video is actively playing, which is
 * exactly the moment this reacts to. The content script runs in every frame, so
 * the frame that owns the player handles its own visibility change (iframes
 * inherit the top tab's visibility state).
 */
export function attachAutoPip(
  video: HTMLVideoElement,
  isEnabled: () => boolean,
): { detach: () => void } {
  // True only while a PiP window WE opened is up, so onShow() closes ours and
  // leaves a user-opened one alone.
  let openedByUs = false;

  const canPip = () =>
    document.pictureInPictureEnabled && !video.disablePictureInPicture;

  async function onHide(): Promise<void> {
    if (!isEnabled() || !canPip()) return;
    if (document.pictureInPictureElement) return; // already floating
    // Only pop out a video that's genuinely playing — not paused, ended, or
    // still buffering with nothing to show.
    if (video.paused || video.ended || video.readyState < 2) return;
    try {
      await video.requestPictureInPicture();
      openedByUs = true;
    } catch {
      /* gesture/availability rejected — nothing to do */
    }
  }

  async function onShow(): Promise<void> {
    if (!openedByUs) return;
    openedByUs = false;
    if (document.pictureInPictureElement === video) {
      try {
        await document.exitPictureInPicture();
      } catch {
        /* ignore */
      }
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void onHide();
    else void onShow();
  };

  // If the user closes the PiP window themselves (native "back to tab" button or
  // the window's close control), stop considering it ours.
  const onLeave = () => {
    openedByUs = false;
  };

  document.addEventListener('visibilitychange', onVisibility);
  video.addEventListener('leavepictureinpicture', onLeave);

  return {
    detach() {
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('leavepictureinpicture', onLeave);
    },
  };
}
