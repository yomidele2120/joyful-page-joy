import { forwardRef, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ChevronDown } from 'lucide-react';
import { BrandLogoPill, WelcomeLogo } from '@/components/BrandLogo';

// Shared look for every sign-in / sign-up page (buyer + supplier):
// dark navy page, centred white card with the Welcome logo on top and the horizontal logo at the bottom, bold small labels, tall inputs and a
// full-width navy button. The card stays white in both themes on purpose,
// the way the reference design does.

export function AuthShell({
  title, children, footer,
}: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#0d2b4c] via-[#0a2240] to-[#06182d] px-4 pb-8 pt-6 sm:pt-10">
      <div className="mx-auto w-full max-w-[480px] flex-1">
        <div className="rounded-md bg-white p-6 text-slate-800 shadow-xl sm:p-8">
          {/* "Welcome To IT Hub Africa" lock-up sits at the top of every sign-in and sign-up card */}
          <Link to="/" aria-label="IT Hub Africa home" className="mb-5 block">
            <WelcomeLogo className="h-16 sm:h-20" />
          </Link>
          <h1 className="mb-7 text-center text-[15px] font-normal uppercase tracking-wide text-slate-600">{title}</h1>
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-[15px] text-white/90">{footer}</div>}
      </div>

      {/* Horizontal logo closes every sign-in and sign-up page */}
      <div className="mt-10 flex justify-center">
        <Link to="/" aria-label="IT Hub Africa home">
          <BrandLogoPill logoClassName="h-9" />
        </Link>
      </div>
    </div>
  );
}

export function AuthFooterLink({ text, to, label }: { text: string; to: string; label: string }) {
  return (
    <>
      {text}{' '}
      <Link to={to} className="font-semibold text-white underline-offset-4 hover:underline">{label}</Link>
    </>
  );
}

const inputBase =
  'block h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-[15px] text-slate-800 placeholder:text-slate-400 ' +
  'outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

function FieldLabel({ htmlFor, children, aside }: { htmlFor: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-600">{children}</label>
      {aside}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; aside?: React.ReactNode };

export const Field = forwardRef<HTMLInputElement, InputProps>(({ label, aside, className = '', ...props }, ref) => {
  const id = useId();
  return (
    <div className="mb-5">
      <FieldLabel htmlFor={id} aside={aside}>{label}</FieldLabel>
      <input ref={ref} id={id} className={`${inputBase} ${className}`} {...props} />
    </div>
  );
});
Field.displayName = 'Field';

export function PasswordField({ label = 'Password', ...props }: Omit<InputProps, 'type' | 'label'> & { label?: string }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="mb-5">
      <FieldLabel htmlFor={id} aside={props.aside}>{label}</FieldLabel>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className={`${inputBase} pr-11`} {...{ ...props, aside: undefined }} />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

export function SelectField({
  label, value, onChange, options, aside,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; aside?: React.ReactNode }) {
  const id = useId();
  return (
    <div className="mb-5">
      <FieldLabel htmlFor={id} aside={aside}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${inputBase} appearance-none bg-slate-100 pr-9`}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}

export const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', "Côte d'Ivoire", 'Cameroon', 'Senegal'];
const DIAL_CODES = ['+234', '+233', '+254', '+27', '+225', '+237', '+221', '+1', '+44'];

// Country-code picker + number. Calls onChange with the full international number.
export function PhoneField({
  label = 'Phone number', value, onChange, required,
}: { label?: string; value: string; onChange: (full: string) => void; required?: boolean }) {
  const id = useId();
  const code = DIAL_CODES.find(c => value.startsWith(c)) ?? '+234';
  const local = value.startsWith(code) ? value.slice(code.length) : value.replace(/^\+/, '');

  const emit = (nextCode: string, nextLocal: string) => {
    const digits = nextLocal.replace(/\D/g, '').replace(/^0+/, '');
    onChange(digits ? `${nextCode}${digits}` : '');
  };

  return (
    <div className="mb-5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-3">
        <div className="relative w-[92px] shrink-0">
          <select
            aria-label="Country code"
            value={code}
            onChange={e => emit(e.target.value, local)}
            className={`${inputBase} appearance-none pr-7`}
          >
            {DIAL_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          value={local}
          onChange={e => emit(code, e.target.value)}
          placeholder="801 234 5678"
          className={inputBase}
        />
      </div>
    </div>
  );
}

// Radio group laid out like the reference: bold option name with a grey hint below it.
export function ChoiceGroup({
  legend, name, value, onChange, options, inline = false,
}: {
  legend: string; name: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[]; inline?: boolean;
}) {
  return (
    <fieldset className="mb-6">
      <legend className="mb-3 text-sm font-semibold text-slate-600">{legend}</legend>
      <div className={inline ? 'flex flex-wrap gap-x-6 gap-y-2' : 'space-y-4'}>
        {options.map(o => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-primary"
            />
            <span>
              <span className={inline ? 'text-[15px] text-slate-700' : 'text-[15px] font-semibold text-slate-700'}>{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-sm leading-snug text-slate-500">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxRow({
  checked, onChange, children,
}: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="mb-6 flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="text-[15px] leading-snug text-slate-600">{children}</span>
    </label>
  );
}

export function SubmitButton({
  children, disabled, loading, type = 'submit', onClick,
}: { children: React.ReactNode; disabled?: boolean; loading?: boolean; type?: 'submit' | 'button'; onClick?: () => void }) {
  const off = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      className={`h-12 w-full rounded-md text-base font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        off ? 'cursor-not-allowed bg-primary/50' : 'bg-primary hover:bg-primary/90 active:bg-primary/80'
      }`}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 shrink-0 rounded-md border border-slate-300 bg-white px-5 text-base font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

export function LegalText() {
  return (
    <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate-600">
      <p>
        By clicking the “Create my account” button, you agree to our{' '}
        <Link to="/terms" className="font-semibold text-primary hover:underline">Terms and Conditions</Link> and acknowledge our{' '}
        <Link to="/privacy-policy" className="font-semibold text-primary hover:underline">Privacy Policy</Link> and{' '}
        <Link to="/cookie-policy" className="font-semibold text-primary hover:underline">Cookie Policy</Link>.
      </p>
      <p>Your details are used only to run your account and process your orders.</p>
    </div>
  );
}
