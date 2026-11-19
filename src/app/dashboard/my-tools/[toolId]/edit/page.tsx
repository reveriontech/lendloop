import { ListingEditor } from "@/components/listing-editor";

export default async function EditListingPage({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  return <ListingEditor toolId={toolId} />;
}
