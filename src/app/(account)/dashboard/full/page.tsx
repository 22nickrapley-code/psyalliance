import { redirect } from "next/navigation";

// The old Home is retired (1.0): every member, verified or waiting, uses the Hub.
export default function RetiredHome() {
  redirect("/dashboard");
}
