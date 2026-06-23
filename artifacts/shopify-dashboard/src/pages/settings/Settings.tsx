import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

const formSchema = z.object({
  store_url: z.string().min(1, "Store URL is required"),
});

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      store_url: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        store_url: settings.store_url || "",
      });
    }
  }, [settings, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          toast.success("Settings updated successfully");
          queryClient.setQueryData(getGetSettingsQueryKey(), data);
        },
        onError: () => {
          toast.error("Failed to update settings");
        },
      }
    );
  }

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader>
          <CardTitle>Store Connection</CardTitle>
          <CardDescription>
            Configure your Shopify store URL to sync orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">API Status:</span>
            {settings?.api_configured ? (
              <Badge variant="outline" className="bg-[#e2f1ea] text-[#00604b] border-[#bedbd0]">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <XCircle className="w-3 h-3 mr-1" />
                Not Configured
              </Badge>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="store_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shopify Store URL</FormLabel>
                    <FormControl>
                      <Input placeholder="your-store.myshopify.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateSettings.isPending} className="bg-[#008060] hover:bg-[#006e52]">
                {updateSettings.isPending ? "Saving..." : "Save"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
