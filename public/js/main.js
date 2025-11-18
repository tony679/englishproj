// main.js — animations and UI effects

document.addEventListener('DOMContentLoaded', function() {
  // Fade in the main container
  const container = document.querySelector('.container');
  if (container) {
    container.style.opacity = 0;
    container.style.transition = 'opacity 0.6s ease-in-out';
    setTimeout(() => {
      container.style.opacity = 1;
    }, 100);
  }

  // Add hover animation for nav links
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => {
    link.addEventListener('mouseenter', () => {
      link.style.transform = 'scale(1.1)';
    });
    link.addEventListener('mouseleave', () => {
      link.style.transform = 'scale(1)';
    });
  });

  // Add button hover shadow effect
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
    });
  });
});
