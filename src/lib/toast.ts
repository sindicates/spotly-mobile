/**
 * Transient toasts. Screens call these; they never import
 * `react-native-toast-message`. Same split as haptics — the library is an
 * implementation detail of one helper, so a second toast surface cannot pick a
 * different look.
 *
 * The host (`AppToast`) must be mounted once at the root, last child, or the
 * show calls are silent.
 */

import Toast from 'react-native-toast-message';

export function showToast(text1: string, text2?: string): void {
  Toast.show({
    type: 'success',
    text1,
    text2,
    visibilityTime: 2500,
  });
}

export function showErrorToast(text1: string): void {
  Toast.show({
    type: 'error',
    text1,
    visibilityTime: 3000,
  });
}
