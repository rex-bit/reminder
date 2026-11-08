import { Segmented } from '../ui/controls';
import { getLang, setLang, type Lang } from './index';

/** Labels are intentionally fixed (not translated) so the switch is readable in either language. */
export function LanguageSwitch() {
  return (
    <Segmented<Lang>
      label="Bahasa / Language"
      value={getLang()}
      onChange={setLang}
      options={[
        { value: 'id', label: 'Indonesia' },
        { value: 'en', label: 'English' },
      ]}
    />
  );
}
