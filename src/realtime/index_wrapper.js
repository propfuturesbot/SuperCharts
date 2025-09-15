/**
 * Trading Chart Wrapper
 *
 * This wrapper loads the improved index_improved.js file which uses the centralized auth system
 * instead of hardcoded tokens and contracts. It provides the same functionality with better
 * authentication management and configurable symbols.
 */

console.log('🚀 Loading Trading Chart Wrapper...');

// Check if we're in a browser environment
if (typeof window === 'undefined') {
  console.error('This wrapper requires a browser environment');
} else {
  console.log('✅ Browser environment detected');

  // Load the improved implementation
  const script = document.createElement('script');
  script.src = 'index_improved.js';
  script.type = 'text/javascript';

  script.onload = function() {
    console.log('✅ Improved trading chart implementation loaded successfully');
    console.log('🔧 Features:');
    console.log('   - Centralized authentication (no hardcoded tokens)');
    console.log('   - Dynamic symbol configuration');
    console.log('   - Maintained calculation accuracy');
    console.log('   - Enhanced error handling');
  };

  script.onerror = function() {
    console.error('❌ Failed to load improved trading chart implementation');
    console.error('🔄 Falling back to original implementation...');

    // Fallback to original implementation if improved version fails
    const fallbackScript = document.createElement('script');
    fallbackScript.src = 'index.js';
    fallbackScript.type = 'text/javascript';

    fallbackScript.onload = function() {
      console.log('⚠️ Fallback to original implementation successful');
    };

    fallbackScript.onerror = function() {
      console.error('❌ Both improved and original implementations failed to load');

      // Update status to show error
      const statusElement = document.getElementById('status');
      if (statusElement) {
        statusElement.textContent = 'Failed to load chart implementation';
        statusElement.classList.remove('connected');
      }
    };

    document.head.appendChild(fallbackScript);
  };

  // Append the script to head to load the improved implementation
  document.head.appendChild(script);
}