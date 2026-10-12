import { TabNav } from "@/components/ui";

export function AdminNav({ current }: { current: string }) {
  return (
    <TabNav
      current={current}
      items={[
        { href: "/admin", label: "Games" },
        { href: "/admin/registration", label: "Registration" },
        { href: "/admin/users", label: "Users & admins" },
        { href: "/admin/audit", label: "Audit log" },
      ]}
    />
  );
}
