// AMROBOT, the CEO's bank app (a parody of a Dutch bank app; ported from the scrapcode game).
// This is the way to see your money: a balance account (player.gold) and a savings account
// (player.savings, "Direct Sparen"). Transfers go to the Simulation as a Command. There are no daily
// income statements and no stock trading yet; see docs/wishlist.md.
import { useState } from 'react';
import { t, tDynamic } from '../../../text/t';
import { bridge } from '../../../store/simBridge';
import { useHud } from '../../../store/stores';
import { usePhone } from '../phoneStore';
import { checkPin, maxWhole, planTransfer, splitGold, type BankAccount } from './bankLogic';

function Logo({ size }: { size: 'sm' | 'lg' }) {
  return (
    <span className={`amr-logo ${size}`} aria-hidden="true">
      <svg viewBox="0 0 32 36" width="100%" height="100%">
        <path d="M2 2h28v16c0 9-7 14-14 16C9 32 2 27 2 18z" fill="#00857a" />
        <path d="M2 2h14v32C9 32 2 27 2 18z" fill="#ffd200" />
        <path d="M9 13l7-6 7 6-7 11z" fill="#004c4c" opacity=".55" />
      </svg>
    </span>
  );
}

/** "🪙 1.130,00" with small cents, like the real app. */
function Money({ amount }: { amount: number }) {
  const { neg, whole, cents } = splitGold(amount);
  return (
    <span className={`amr-money${neg ? ' neg' : ''}`}>
      {neg ? '− ' : ''}
      {t('app.bank.currency')} {whole},<sup>{cents}</sup>
    </span>
  );
}

function Login() {
  const unlock = usePhone((s) => s.setBankUnlocked);
  const push = useHud((h) => h.pushToast);
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState<'digits' | 'length' | null>(null);
  const go = () => {
    const r = checkPin(pin);
    if (r === 'ok') unlock(true);
    else setBad(r);
  };
  return (
    <div className="amr amr-login">
      <div className="amr-login-top">
        <Logo size="lg" />
        <div className="amr-brand">{t('app.bank.name')}</div>
        <small>{t('app.bank.tagline')}</small>
      </div>
      <form
        className="amr-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <p>{t('app.bank.login.hint')}</p>
        <input
          className={`amr-pin${bad ? ' bad' : ''}`}
          type="password"
          inputMode="numeric"
          maxLength={5}
          autoComplete="off"
          aria-label={t('app.bank.pin.label')}
          aria-invalid={bad !== null}
          aria-describedby="amr-pin-msg"
          placeholder={t('app.bank.pin.placeholder')}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setBad(null);
          }}
        />
        <button type="submit" className="amr-yellow">
          {t('app.bank.pin.confirm')}
        </button>
        <p id="amr-pin-msg" className="amr-pin-msg" role="status">
          {bad ? t(bad === 'digits' ? 'app.bank.pin.err.digits' : 'app.bank.pin.err.length') : ''}
        </p>
        <button type="button" className="amr-link" onClick={() => push('app.bank.pin.forgotToast')}>
          {t('app.bank.pin.forgot')}
        </button>
      </form>
    </div>
  );
}

function Head({ title }: { title: string }) {
  const unlock = usePhone((s) => s.setBankUnlocked);
  return (
    <div className="amr-head">
      <div className="amr-head-row">
        <Logo size="sm" />
        <span className="amr-brand-sm">{t('app.bank.name')}</span>
        <button type="button" className="amr-logout" onClick={() => unlock(false)}>
          {t('app.bank.logout')}
        </button>
      </div>
      <h2>{title}</h2>
    </div>
  );
}

function AccountRow({ account, onOpen }: { account: BankAccount; onOpen: () => void }) {
  const gold = useHud((h) => h.gold);
  const savings = useHud((h) => h.savings);
  return (
    <button type="button" className="amr-acct" onClick={onOpen}>
      <span className="amr-acct-ic" aria-hidden="true">
        {account === 'balance' ? '👛' : '🐷'}
      </span>
      <span className="amr-acct-nm">
        <b>{tDynamic(`app.bank.account.${account}`)}</b>
        <small>{tDynamic(`app.bank.iban.${account}`)}</small>
      </span>
      <Money amount={account === 'balance' ? gold : savings} />
    </button>
  );
}

function Overview() {
  const gold = useHud((h) => h.gold);
  const savings = useHud((h) => h.savings);
  const setTab = usePhone((s) => s.setTab);
  return (
    <>
      <Head title={t('app.bank.tab.overview')} />
      <div className="amr-page">
        <h3 className="amr-sec">{t('app.bank.section.balance')}</h3>
        <AccountRow account="balance" onOpen={() => setTab('bank', 'savings')} />
        {gold < 0 && <p className="amr-note neg">{t('app.bank.debt')}</p>}
        <p className="amr-note">{t('app.bank.overview.note')}</p>
        <h3 className="amr-sec">{t('app.bank.section.savings')}</h3>
        <AccountRow account="savings" onOpen={() => setTab('bank', 'savings')} />
        <h3 className="amr-sec">{t('app.bank.section.total')}</h3>
        <div className="amr-total">
          <span>{t('app.bank.total')}</span>
          <Money amount={gold + savings} />
        </div>
        <h3 className="amr-sec">{t('app.bank.section.invest')}</h3>
        <button type="button" className="amr-card soon" onClick={() => setTab('bank', 'invest')}>
          <span className="amr-card-ic" aria-hidden="true">
            📈
          </span>
          <b>{t('app.bank.invest.coin')}</b>
          <small>{t('app.bank.soon')}</small>
        </button>
      </div>
      <div className="amr-foot">
        <button type="button" className="amr-yellow wide" onClick={() => setTab('bank', 'savings')}>
          {t('app.bank.transfer')}
        </button>
      </div>
    </>
  );
}

function Savings() {
  const gold = useHud((h) => h.gold);
  const savings = useHud((h) => h.savings);
  const [from, setFrom] = useState<BankAccount>('balance');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<{ key: string; ok: boolean } | null>(null);
  const to: BankAccount = from === 'balance' ? 'savings' : 'balance';
  const go = () => {
    const plan = planTransfer(from, to, amount, gold, savings);
    if (!plan.ok) {
      setMsg({ key: plan.errorKey, ok: false });
      return;
    }
    bridge.loop?.sim.submit({ type: 'transferSavings', direction: plan.direction, amount: plan.amount });
    setAmount('');
    setMsg({ key: 'app.bank.transfer.sent', ok: true });
  };
  const chip = (whole: number) => (
    <button type="button" className="amr-chip" onClick={() => setAmount(String(whole))}>
      {whole}
    </button>
  );
  return (
    <>
      <Head title={t('app.bank.tab.savings')} />
      <div className="amr-page">
        <h3 className="amr-sec">{t('app.bank.section.savings')}</h3>
        <AccountRow account="savings" onOpen={() => undefined} />
        <h3 className="amr-sec">{t('app.bank.transfer.title')}</h3>
        <form
          className="amr-form"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <div className="amr-seg" role="group" aria-label={t('app.bank.transfer.from')}>
            {(['balance', 'savings'] as const).map((a) => (
              <button key={a} type="button" className={from === a ? 'on' : ''} aria-pressed={from === a} onClick={() => setFrom(a)}>
                {tDynamic(`app.bank.account.${a}`)}
              </button>
            ))}
          </div>
          <p className="amr-flow">
            {t('app.bank.transfer.flow', { from: tDynamic(`app.bank.account.${from}`), to: tDynamic(`app.bank.account.${to}`) })}
          </p>
          <label>
            {t('app.bank.transfer.amount')}
            <input
              className="amr-input"
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, '').slice(0, 12));
                setMsg(null);
              }}
            />
          </label>
          <div className="amr-chips">
            {chip(10)}
            {chip(50)}
            <button type="button" className="amr-chip" onClick={() => setAmount(String(maxWhole(from, gold, savings)))}>
              {t('app.bank.chip.all')}
            </button>
          </div>
          <button type="submit" className="amr-yellow wide">
            {t('app.bank.transfer.go')}
          </button>
          <p className={`amr-pin-msg${msg?.ok ? ' ok' : ''}`} role="status">
            {msg ? tDynamic(msg.key) : ''}
          </p>
        </form>
        <p className="amr-note soon">{t('app.bank.savings.soon')}</p>
      </div>
    </>
  );
}

function Invest() {
  return (
    <>
      <Head title={t('app.bank.tab.invest')} />
      <div className="amr-page">
        <div className="amr-invest">
          <div className="amr-coin">
            <b>{t('app.bank.invest.coin')}</b>
            <span className="up">{t('app.bank.invest.change')}</span>
          </div>
          <svg className="amr-fakegraph" viewBox="0 0 300 110" width="100%" height="110" aria-hidden="true">
            <polyline fill="rgba(0,133,122,.12)" stroke="none" points="0,110 0,80 25,72 50,78 75,60 100,66 125,40 150,52 175,30 200,44 225,24 250,38 275,18 300,26 300,110" />
            <polyline fill="none" stroke="#00857a" strokeWidth="3" points="0,80 25,72 50,78 75,60 100,66 125,40 150,52 175,30 200,44 225,24 250,38 275,18 300,26" />
          </svg>
          <div className="amr-soonbox">{t('app.bank.invest.soon')}</div>
          <p className="amr-note">{t('app.bank.invest.note')}</p>
        </div>
      </div>
    </>
  );
}

export function BankApp({ tab }: { tab: string | undefined; id: string | undefined }) {
  const unlocked = usePhone((s) => s.bankUnlocked);
  if (!unlocked) return <Login />;
  return <div className="amr">{tab === 'savings' ? <Savings /> : tab === 'invest' ? <Invest /> : <Overview />}</div>;
}
