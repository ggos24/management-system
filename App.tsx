// App.tsx is no longer the main entry point.
// Routing is now handled by routes.tsx with React Router.
// This file is kept for backward compatibility (e.g. test imports).

import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';

const App: React.FC = () => <RouterProvider router={router} />;

export default App;
