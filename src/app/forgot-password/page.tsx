import type {Metadata} from "next";
import CustomerAuth from "@/components/customer-auth";
export const metadata:Metadata={title:"Customer forgot-password | Srikalahasti Kalamkari"};
export default function Page(){return <CustomerAuth mode="forgot"/>}
