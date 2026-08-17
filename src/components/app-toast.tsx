import { CircleAlertIcon, HeartIcon } from 'lucide-react-native';
import { View } from 'react-native';
import Toast, { type ToastConfig } from 'react-native-toast-message';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * Root toast host. Custom layouts — the library's `BaseToast` hardcodes colour,
 * which is a dark-mode bug. These use `bg-card` / `text-foreground` so they
 * follow the palette.
 *
 * Mount once, last child of the root providers, the same reason `PortalHost`
 * is last: anything that paints above the current screen has to sit outside it.
 */

function ToastBody({
  text1,
  text2,
  icon,
  iconClassName,
}: {
  text1?: string;
  text2?: string;
  icon: typeof HeartIcon;
  iconClassName: string;
}) {
  if (!text1) return null;

  return (
    <View className="border-border bg-card mx-5 flex-row items-center gap-3 rounded-lg border p-4">
      <Icon as={icon} size={18} className={iconClassName} />
      <View className="shrink gap-0.5">
        <Text className="font-semibold">{text1}</Text>
        {text2 ? <Text variant="muted">{text2}</Text> : null}
      </View>
    </View>
  );
}

const config: ToastConfig = {
  success: ({ text1, text2 }) => (
    <ToastBody text1={text1} text2={text2} icon={HeartIcon} iconClassName="text-primary" />
  ),
  error: ({ text1, text2 }) => (
    <ToastBody text1={text1} text2={text2} icon={CircleAlertIcon} iconClassName="text-destructive" />
  ),
};

export function AppToast() {
  return <Toast config={config} topOffset={56} />;
}
