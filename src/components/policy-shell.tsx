import type {ReactNode} from 'react';
import Header from '@/components/storefront-header';
import PremiumFooter from '@/components/premium-footer';
import './policy-shell.css';
export default function PolicyShell({eyebrow,title,children}:{eyebrow:string,title:string,children:ReactNode}){return <><Header/><main className="skpolicy"><div className="skpolicy__wrap"><div className="skpolicy__intro"><span>{eyebrow}</span><h1>{title}</h1><p>Last updated: November 2026</p></div><article className="skpolicy__body">{children}</article></div></main><PremiumFooter/></>}
