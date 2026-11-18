import { themes, type Theme } from '../themes';

export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="theme-picker">
      <div className="theme-picker-heading"><span>Theme</span><span className="theme-name" aria-live="polite">{theme}</span></div>
      <div className="swatches" role="group" aria-label="Gift theme">
        {Object.entries(themes).map(([key, colors]) => (
          <button
            key={key}
            type="button"
            title={`${key} theme`}
            aria-label={`${key} theme`}
            aria-pressed={theme === key}
            className={theme === key ? 'selected' : ''}
            style={{ background: `repeating-linear-gradient(90deg, ${colors.stripe} 0 7px, ${colors.paper} 7px 14px)` }}
            onClick={() => onChange(key as Theme)}
          />
        ))}
      </div>
    </div>
  );
}
