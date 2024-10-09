import React, { createContext, useState, useContext } from 'react';
import PropTypes from 'prop-types'; // Add this import

// Create a Context
const AppContext = createContext<
  { blobUrl: string | null; setBlobUrl: (url: string | null) => void } | undefined
>(undefined); // Specify context type

// Create a Provider component
export const AppProvider = ({ children }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null); // Specify state type
  

  return (
    <AppContext.Provider value={{ blobUrl, setBlobUrl }}>
      {children} {/* Fix the children placement here */}
    </AppContext.Provider>
  );
};

// Add PropTypes validation
AppProvider.propTypes = {
  children: PropTypes.node.isRequired, // Add this line
};

// Create a custom hook to use the context
export const useAppContext = () => {
  const context = useContext(AppContext); // Get context
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider'); // Add error handling
  }
  return context;
};
