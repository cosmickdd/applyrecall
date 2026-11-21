import GlassyDashboardDemo from "@/components/ui/demo";

export const metadata = {
  title: "Spatial Workspace — ApplyRecall",
  description: "Spatial analytics and operations dashboard powered by Glassy Dashboard",
};

export default function GlassyDashboardPage() {
  return (
    <div className="w-full min-h-screen">
      <GlassyDashboardDemo workspaceName="ApplyRecall Spatial" panelFrost={14} />
    </div>
  );
}
