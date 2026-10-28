import { can, useAuth } from "@/src/auth";
import { RoleTabs } from "@/src/components/RoleTabs";

export default function AdminTabs() {
  const { user } = useAuth();
  const role = user?.role;
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Dashboard", icon: "grid", sf: "square.grid.2x2.fill" },
        { name: "bookings", title: "Dispatch", icon: "git-network", sf: "list.bullet.clipboard.fill", hidden: !can(role, "dispatch") },
        { name: "drivers", title: "Drivers", icon: "people", sf: "person.2.fill", hidden: !can(role, "drivers") },
        { name: "more", title: "More", icon: "apps", sf: "ellipsis.circle.fill" },
      ]}
    />
  );
}
