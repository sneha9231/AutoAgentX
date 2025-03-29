import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, CircularProgress, Paper, Button, Alert } from '@mui/material';
import { Check as CheckIcon, Error as ErrorIcon } from '@mui/icons-material';

const AuthCallback = () => {
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const processAuth = async () => {
      try {
        // Extract the authorization code from URL
        const urlParams = new URLSearchParams(location.search);
        const code = urlParams.get('code');
        
        if (!code) {
          throw new Error('No authorization code found in redirect URL');
        }
        
        setStatus('Authorization code received. Exchanging for tokens...');
        
        // Exchange the code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code,
            client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
            client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET,
            redirect_uri: window.location.origin + '/auth/callback',
            grant_type: 'authorization_code',
          }),
        });
        
        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error || tokenResponse.statusText}`);
        }
        
        setStatus('Tokens received. Getting user information...');
        
        const tokenData = await tokenResponse.json();
        
        // Store the tokens
        localStorage.setItem('google_access_token', tokenData.access_token);
        localStorage.setItem('google_refresh_token', tokenData.refresh_token);
        localStorage.setItem('google_token_expiry', Date.now() + tokenData.expires_in * 1000);
        
        // Get user information
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        
        if (!userInfoResponse.ok) {
          throw new Error('Failed to get user information');
        }
        
        const userData = await userInfoResponse.json();
        
        // Store user information
        localStorage.setItem('google_user_email', userData.email);
        localStorage.setItem('google_user_name', userData.name);
        
        setStatus('Authentication successful! You can now create events in your Google Calendar.');
        setSuccess(true);
        
        // Redirect back to the main app after a delay
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } catch (err) {
        console.error('Authentication error:', err);
        setError(err.message || 'An unknown error occurred during authentication');
        setStatus('Authentication failed');
      }
    };
    
    processAuth();
  }, [location, navigate]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        p: 3
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          borderRadius: 2,
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center'
        }}
      >
        <Typography variant="h5" gutterBottom>
          Google Calendar Authentication
        </Typography>
        
        <Box sx={{ my: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {error ? (
            <>
              <ErrorIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
              <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
                {error}
              </Alert>
              <Typography variant="body1" gutterBottom>
                Please try again or contact support if the issue persists.
              </Typography>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={() => navigate('/calendar-auth')}
                sx={{ mt: 2 }}
              >
                Try Again
              </Button>
            </>
          ) : success ? (
            <>
              <CheckIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="body1" gutterBottom>
                {status}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Redirecting you back to the application...
              </Typography>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={() => navigate('/')}
                sx={{ mt: 2 }}
              >
                Return to App Now
              </Button>
            </>
          ) : (
            <>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography variant="body1" gutterBottom>
                {status}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Please wait while we complete the authentication process.
              </Typography>
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default AuthCallback; 