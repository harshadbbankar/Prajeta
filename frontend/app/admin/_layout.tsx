import { RoleTabs } from "@/src/components/RoleTabs";

export default function AdminTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Dashboard", icon: "grid", sf: "square.grid.2x2.fill" },
        { name: "bookings", title: "Dispatch", icon: "git-network", sf: "list.bullet.clipboard.fill" },
        { name: "drivers", title: "Drivers", icon: "people", sf: "person.2.fill" },
        { name: "more", title: "More", icon: "apps", sf: "ellipsis.circle.fill" },
      ]}
    />
  );
}
