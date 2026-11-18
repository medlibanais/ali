import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import App from './src/App';
// Defines the Android background sync task before anything else runs.
import './src/features/offline/backgroundSync';

registerRootComponent(App);
