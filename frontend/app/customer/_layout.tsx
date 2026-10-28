import { RoleTabs } from "@/src/components/RoleTabs";

export default function CustomerTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Home", icon: "home", sf: "house.fill" },
        { name: "bookings", title: "Bookings", icon: "receipt", sf: "list.bullet.rectangle.fill" },
        { name: "support", title: "Support", icon: "chatbubbles", sf: "bubble.left.and.bubble.right.fill" },
        { name: "profile", title: "Profile", icon: "person-circle", sf: "person.crop.circle.fill" },
      ]}
    />
  );
}
