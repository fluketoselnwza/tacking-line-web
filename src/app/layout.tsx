import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'MaterialIQ · Recipe Material Usage',description:'ระบบบริหารและวิเคราะห์ปริมาณการใช้วัตถุดิบการผลิต'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}
