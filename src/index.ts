import fetch from "node-fetch";
import FormData from "form-data";
import { Command, flags } from "@oclif/command";

class CloudflareKvSwap extends Command {
  static description = "swap a Cloudflare KV namespace with an empty one";

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    account: flags.string({
      char: "a",
      description: "Cloudflare account ID",
      required: true,
    }),
    token: flags.string({
      char: "t",
      description: "Cloudflare API token",
      required: true,
    }),
    name: flags.string({
      char: "n",
      description: "Cloudflare KV namespace name",
      required: true,
    }),
  };

  async run() {
    const { flags } = this.parse(CloudflareKvSwap);

    const workerList = await (
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${flags.account}/workers/scripts`,
        {
          headers: {
            Authorization: `Bearer ${flags.token}`,
          },
        }
      )
    ).json();
    const workerIds: string[] = workerList.result.map((item: any) => item.id);

    const kvList: { id: string; title: string }[] = (
      await (
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${flags.account}/storage/kv/namespaces`,
          {
            headers: {
              Authorization: `Bearer ${flags.token}`,
            },
          }
        )
      ).json()
    ).result;

    const kvToDelete = kvList.find((item) => item.title === flags.name);
    if (kvToDelete === undefined) {
      this.error(`Failed to locate KV namespace "${flags.name}"`);
    }

    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${flags.account}/storage/kv/namespaces/${kvToDelete.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${flags.token}`,
        },
      }
    );

    const newKvId: string = (
      await (
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${flags.account}/storage/kv/namespaces`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${flags.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: flags.name,
            }),
          }
        )
      ).json()
    ).result.id;

    for (const workerId of workerIds) {
      const currentWorkerBindings: {
        name: string;
        namespace_id?: string;
        type: string;
      }[] = (
        await (
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${flags.account}/workers/scripts/${workerId}/bindings`,
            {
              headers: {
                Authorization: `Bearer ${flags.token}`,
              },
            }
          )
        ).json()
      ).result;

      const needToUpdate: boolean =
        currentWorkerBindings.find(
          (item) => item.namespace_id === kvToDelete.id
        ) !== undefined;

      if (needToUpdate) {
        this.log(`Updating bindings for worker ${workerId}`);

        const currentWorkerScript: string = await (
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${flags.account}/workers/scripts/${workerId}`,
            {
              headers: {
                Authorization: `Bearer ${flags.token}`,
              },
            }
          )
        ).text();

        const formData: FormData = new FormData();
        formData.append(
          "metadata",
          JSON.stringify({
            body_part: "script",
            bindings: currentWorkerBindings.map((item) => {
              if (item.type === "secret_text")
                return {
                  ...item,
                  type: "inherit",
                };

              if (item.namespace_id === kvToDelete.id)
                return {
                  ...item,
                  namespace_id: newKvId,
                };

              return item;
            }),
          }),
          {
            contentType: "application/json",
          }
        );
        formData.append("script", currentWorkerScript, {
          contentType: "application/javascript",
        });

        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${flags.account}/workers/scripts/${workerId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${flags.token}`,
            },
            body: formData,
          }
        );
      }
    }
  }
}

export = CloudflareKvSwap;
