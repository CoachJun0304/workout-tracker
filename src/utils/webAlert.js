import { Alert, Platform } from 'react-native';

export function showAlert(title, message, buttons = []) {
  if (Platform.OS === 'web') {
    if (buttons.length === 0) {
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
      return;
    }
    if (buttons.length === 1) {
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
      buttons[0]?.onPress?.();
      return;
    }
    // For confirm dialogs (2+ buttons with destructive/cancel)
    const confirmBtn = buttons.find(b => b.style === 'destructive' || (!b.style && b.text !== 'Cancel'));
    const result = window.confirm(`${title}${message ? '\n\n' + message : ''}`);
    if (result && confirmBtn?.onPress) {
      confirmBtn.onPress();
    } else if (!result) {
      const cancelBtn = buttons.find(b => b.style === 'cancel');
      cancelBtn?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}

export function showConfirm(title, message, onConfirm, onCancel, confirmText = 'OK', destructive = false) {
  if (Platform.OS === 'web') {
    const result = window.confirm(`${title}${message ? '\n\n' + message : ''}`);
    if (result) onConfirm?.();
    else onCancel?.();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}