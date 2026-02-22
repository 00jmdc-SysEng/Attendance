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
      <div style="background: rgba(30, 10, 10, 0.95); border: 2px solid rgba(200, 50, 50, 0.5); color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); max-width: 90%; width: 350px;">
        <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
        <h2 style="margin-bottom: 15px; font-size: 24px; color: #c83232;">Email Verified!</h2>
        <p style="margin-bottom: 25px; line-height: 1.6; color: rgba(255, 255, 255, 0.8);">
          Your email has been successfully verified.
        </p>
        <button onclick="window.close()" style="background: linear-gradient(135deg, #c83232 0%, #8b1a1a 100%); color: white; border: none; padding: 12px 30px; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: 600; width: 100%; margin-bottom: 10px;">
          Close Window
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Disable scrolling on body
    document.body.style.overflow = 'hidden';
  }
});
