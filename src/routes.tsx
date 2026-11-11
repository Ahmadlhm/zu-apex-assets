import { lazy } from 'react'

export const GatesApp = lazy(() => import('./App'))
export const RegistrationApp = lazy(() => import('./registration/RegistrationApp'))
export const Home = lazy(() => import('./home/Home'))
