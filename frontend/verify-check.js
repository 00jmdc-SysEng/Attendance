document.addEventListener('DOMContentLoaded', () => {
  // Check for Supabase Auth verification parameters
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);

  // Supabase often uses hash fragments for auth tokens
  // Common patterns: access_token=..., type=signup, type=recovery
  const isAuthRedirect = hash.includes('access_token') ||
                         hash.includes('type=signup') ||
                         hash.includes('type=recovery') ||
                         hash.includes('type=magiclink') ||
                         params.get('type') === 'signup';

  // Check if we are on a mobile device (likely opened from the App's email link)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isAuthRedirect && isMobile) {
    // Create overlay to instruct user to go back to app
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    overlay.style.zIndex = '99999'; // Ensure it's on top of everything
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = 'white';
    overlay.style.padding = '20px';
    overlay.style.textAlign = 'center';

    overlay.innerHTML = `
      <div style="background: white; color: #2d3748; padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 90%; width: 350px;">
        <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
        <h2 style="margin-bottom: 15px; font-size: 24px; color: #2d3748;">Email Verified!</h2>
        <p style="margin-bottom: 25px; line-height: 1.6; color: #4a5568;">
          Your email has been successfully verified.
        </p>
        <div style="background: #ebf8ff; border-left: 4px solid #4299e1; padding: 15px; margin-bottom: 25px; text-align: left;">
          <p style="color: #2c5282; font-size: 14px; margin: 0;">
            <strong>Next Step:</strong> You can now close this browser window and return to the <strong>Attendance App</strong> to log in.
          </p>
        </div>
        <button onclick="window.close()" style="background: #667eea; color: white; border: none; padding: 12px 30px; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: 600; width: 100%; margin-bottom: 10px;">
          Close Window
        </button>
        <p style="font-size: 12px; color: #a0aec0;">
          If the button doesn't work, please switch back to the app manually.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Disable scrolling on body
    document.body.style.overflow = 'hidden';
  }
});
