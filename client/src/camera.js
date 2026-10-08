// Turns a camera/scanner failure into a message the shop owner can act on.
export function cameraErrorMessage(err) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'The camera only works on https:// or http://localhost. Open the app via localhost (or serve it over HTTPS), or type the product code below.';
  }
  const text = String(err?.name || err?.message || err || '');
  if (/NotAllowed|Permission/i.test(text)) {
    return 'Camera permission was denied. Allow camera access in your browser settings, or type the product code below.';
  }
  if (/NotFound|Devices/i.test(text)) {
    return 'No camera was found on this device. You can type the product code below instead.';
  }
  if (/NotReadable|TrackStart|in use/i.test(text)) {
    return 'The camera is being used by another app or tab. Close it and try again, or type the product code below.';
  }
  return 'Could not start the camera. You can type the product code below instead.';
}

// Scanners fire the success callback many times per second while a code stays
// in view. This returns a function that lets a given code through at most once
// per `cooldownMs`, so one scan = one action.
export function makeScanGate(cooldownMs = 2500) {
  let lastCode = '';
  let lastTime = 0;
  return (code) => {
    const now = Date.now();
    if (code === lastCode && now - lastTime < cooldownMs) return false;
    lastCode = code;
    lastTime = now;
    return true;
  };
}
