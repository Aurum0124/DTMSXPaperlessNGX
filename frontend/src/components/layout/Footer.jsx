import React from 'react';

/**
 * Footer Component
 *
 * Max-width container (1280px), centered.
 * ITO credit and copyright. Use centered prop for admin/department pages.
 */
function Footer({ centered = false }) {
  return (
    <footer className={`app-footer ${centered ? 'app-footer-centered' : ''}`}>
      <div className="app-footer-inner">
        <div className="app-footer-content">
          <div className="app-footer-section">
            <div className="app-footer-copyright">
              © 2026 Provincial Government of Ilocos Norte. All Rights Reserved
            </div>
            <div className="app-footer-ito">
              Powered by Information Technology Office Software Engineering Section
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
