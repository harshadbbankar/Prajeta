import { RoleTabs } from "@/src/components/RoleTabs";

export default function DriverTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Today", icon: "speedometer", sf: "steeringwheel" },
        { name: "jobs", title: "Jobs", icon: "briefcase", sf: "briefcase.fill" },
        { name: "earnings", title: "Earnings", icon: "wallet", sf: "indianrupeesign.circle.fill" },
        { name: "profile", title: "Profile", icon: "person-circle", sf: "person.crop.circle.fill" },
      ]}
    />
  );
}
