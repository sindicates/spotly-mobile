/// <reference types="nativewind/types" />

// Metro + NativeWind resolve the stylesheet at build time; TypeScript only
// needs to know the side-effect import is legal.
declare module '*.css';
