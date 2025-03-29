import React from 'react';
import { Button } from '@mui/material';

const GoogleAuth = () => {
  // Google OAuth config
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  
  // Define the scopes we need for Google Calendar CRUD operations
  const scopes = [
    'https://www.googleapis.com/auth/calendar',           // Full access to Google Calendar
    'https://www.googleapis.com/auth/calendar.events',    // Full access to Calendar events
    'https://www.googleapis.com/auth/userinfo.email',     // Get user email
    'https://www.googleapis.com/auth/userinfo.profile',   // Get basic profile info
  ];
  
  // Create the OAuth URL
  const createAuthUrl = () => {
    const redirectUri = window.location.origin + '/auth/callback';
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');
    
    return authUrl.toString();
  };
  
  // Handle the auth button click
  const handleAuthClick = () => {
    const authUrl = createAuthUrl();
    window.location.href = authUrl;
  };
  
  return (
    <Button 
      variant="contained" 
      color="primary" 
      onClick={handleAuthClick}
      sx={{ 
        mt: 2, 
        mb: 2,
        backgroundColor: '#4285F4',
        '&:hover': {
          backgroundColor: '#357ae8',
        } 
      }}
    >
      Connect to Google Calendar
    </Button>
  );
};

export default GoogleAuth; 