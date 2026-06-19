import { NotificationService } from "./notification.service";

const user = { userId: "user_owner", businessId: "business_1", role: "OWNER", email: "owner@example.com", isSystemAdmin: false };

describe("NotificationService", () => {
  it("fans out staff request notifications to users with members.manage and branch access", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: "member_request",
          businessId: "business_1",
          status: "PENDING",
          employeeName: "Narin",
          requestedBranchId: "branch_1",
          user: { name: "Narin", email: "narin@example.com" },
          requestedBranch: { id: "branch_1", name: "สาขาอโศก" }
        }),
        findMany: jest.fn().mockResolvedValue([
          { userId: "owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] },
          { userId: "branch_manager", role: "BRANCH_MANAGER", permissionOverrides: { "members.manage": true }, branchAssignments: [{ branchId: "branch_1" }] },
          { userId: "other_branch", role: "BRANCH_MANAGER", permissionOverrides: { "members.manage": true }, branchAssignments: [{ branchId: "branch_2" }] },
          { userId: "viewer", role: "VIEWER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_1" }] }
        ])
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_1" })
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 })
      }
    };
    const service = new NotificationService(prisma);

    await service.createStaffRequestNotification("business_1", "member_request");

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: "STAFF_REQUEST",
        branchId: "branch_1",
        dedupeKey: "staff-request:member_request"
      })
    }));
    expect(prisma.notificationRecipient.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { notificationId: "notification_1", userId: "owner" },
        { notificationId: "notification_1", userId: "branch_manager" }
      ]),
      skipDuplicates: true
    });
    expect(prisma.notificationRecipient.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it("marks notification recipients read and archives per user", async () => {
    const prisma: any = {
      notificationRecipient: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: "recipient_1", userId: "user_owner", readAt: null, notification: { businessId: "business_1" } })
          .mockResolvedValueOnce({ id: "recipient_1", userId: "user_owner", readAt: new Date("2026-06-18T00:00:00.000Z"), notification: { businessId: "business_1" } }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn()
      }
    };
    const service = new NotificationService(prisma);

    await service.markRead(user, "recipient_1");
    await service.archive(user, "recipient_1");

    expect(prisma.notificationRecipient.update).toHaveBeenNthCalledWith(1, {
      where: { id: "recipient_1" },
      data: { readAt: expect.any(Date) }
    });
    expect(prisma.notificationRecipient.update).toHaveBeenNthCalledWith(2, {
      where: { id: "recipient_1" },
      data: { archivedAt: expect.any(Date), readAt: new Date("2026-06-18T00:00:00.000Z") }
    });
  });

  it("checks branch access before marking a branch read", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_other", businessId: "business_1", status: "ACTIVE" })
      },
      notificationRecipient: {
        updateMany: jest.fn()
      }
    };
    const service = new NotificationService(prisma);

    await expect(service.markAllRead({ ...user, role: "MANAGER", assignedBranchIds: ["branch_allowed"] }, { branchId: "branch_other" })).rejects.toThrow("Branch is not available for this user");
    expect(prisma.notificationRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("returns only resolved or archived notifications for history without syncing live alerts", async () => {
    const prisma: any = {
      notificationRecipient: {
        findMany: jest.fn().mockResolvedValue([
          { id: "recipient_history", readAt: null, archivedAt: null, createdAt: new Date("2026-06-18T00:00:00.000Z"), notification: { id: "notification_history", resolvedAt: new Date("2026-06-18T00:00:00.000Z") } }
        ])
      },
      product: {
        findMany: jest.fn()
      }
    };
    const service = new NotificationService(prisma);

    await service.list(user, { status: "history" });

    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.notificationRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user_owner",
        notification: expect.objectContaining({
          businessId: "business_1",
          OR: [
            { resolvedAt: { not: null } },
            { recipients: { some: { userId: "user_owner", archivedAt: { not: null } } } }
          ]
        })
      })
    }));
  });

  it("returns paginated notification history with a next cursor", async () => {
    const prisma: any = {
      notificationRecipient: {
        findMany: jest.fn().mockResolvedValue([
          { id: "recipient_1", readAt: null, archivedAt: null, createdAt: new Date("2026-06-18T03:00:00.000Z"), notification: { id: "notification_1", resolvedAt: new Date("2026-06-18T03:00:00.000Z"), createdAt: new Date("2026-06-18T03:00:00.000Z") } },
          { id: "recipient_2", readAt: null, archivedAt: null, createdAt: new Date("2026-06-18T02:00:00.000Z"), notification: { id: "notification_2", resolvedAt: new Date("2026-06-18T02:00:00.000Z"), createdAt: new Date("2026-06-18T02:00:00.000Z") } },
          { id: "recipient_3", readAt: null, archivedAt: null, createdAt: new Date("2026-06-18T01:00:00.000Z"), notification: { id: "notification_3", resolvedAt: new Date("2026-06-18T01:00:00.000Z"), createdAt: new Date("2026-06-18T01:00:00.000Z") } }
        ])
      }
    };
    const service = new NotificationService(prisma);

    await expect(service.list(user, { status: "history", limit: "2", cursor: "2026-06-18T04:00:00.000Z" })).resolves.toEqual({
      items: [
        expect.objectContaining({ id: "recipient_1" }),
        expect.objectContaining({ id: "recipient_2" })
      ],
      nextCursor: "2026-06-18T02:00:00.000Z|2026-06-18T02:00:00.000Z|recipient_2"
    });
    expect(prisma.notificationRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ notification: { createdAt: { lt: new Date("2026-06-18T04:00:00.000Z") } } }]
      }),
      take: 3
    }));
  });

  it("allows managers to audit notification history for their assigned branches", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({
          userId: "manager",
          role: "BRANCH_MANAGER",
          permissionOverrides: {},
          branchAssignments: [{ branchId: "branch_allowed" }]
        })
      },
      notificationRecipient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "recipient_audit",
            readAt: null,
            archivedAt: null,
            createdAt: new Date("2026-06-18T00:00:00.000Z"),
            user: { id: "staff", name: "Staff", email: "staff@example.com" },
            notification: { id: "notification_audit", resolvedAt: new Date("2026-06-18T00:00:00.000Z") }
          }
        ])
      }
    };
    const service = new NotificationService(prisma);

    const result = await service.audit({ ...user, userId: "manager", role: "BRANCH_MANAGER", assignedBranchIds: ["branch_allowed"] }) as any[];

    expect(result[0]).toEqual(expect.objectContaining({ user: { id: "staff", name: "Staff", email: "staff@example.com" } }));
    expect(prisma.notificationRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        notification: expect.objectContaining({
          businessId: "business_1",
          OR: [{ branchId: { in: ["branch_allowed"] } }, { branchId: null }]
        })
      })
    }));
  });

  it("blocks branch managers from auditing a branch outside their assignment", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_other", businessId: "business_1", status: "ACTIVE" })
      },
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({
          userId: "manager",
          role: "BRANCH_MANAGER",
          permissionOverrides: {},
          branchAssignments: [{ branchId: "branch_allowed" }]
        })
      },
      notificationRecipient: {
        findMany: jest.fn()
      }
    };
    const service = new NotificationService(prisma);

    await expect(service.audit({ ...user, userId: "manager", role: "BRANCH_MANAGER" }, { branchId: "branch_other" })).rejects.toThrow("Branch is not available for this user");
    expect(prisma.notificationRecipient.findMany).not.toHaveBeenCalled();
  });

  it("blocks non-manager notification audit access", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({
          userId: "cashier",
          role: "CASHIER",
          permissionOverrides: {},
          branchAssignments: [{ branchId: "branch_1" }]
        })
      },
      notificationRecipient: {
        findMany: jest.fn()
      }
    };
    const service = new NotificationService(prisma);

    await expect(service.audit({ ...user, userId: "cashier", role: "CASHIER" })).rejects.toThrow("Notification audit is restricted to managers");
    expect(prisma.notificationRecipient.findMany).not.toHaveBeenCalled();
  });

  it("dedupes active stock alerts and resolves them when stock recovers", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            {
              id: "product_1",
              name: "กาแฟ",
              minStock: 5,
              balances: [{ quantity: 2, warehouse: { branchId: "branch_1" } }]
            }
          ])
          .mockResolvedValueOnce([
            {
              id: "product_1",
              name: "กาแฟ",
              minStock: 5,
              balances: [{ quantity: 8, warehouse: { branchId: "branch_1" } }]
            }
          ])
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_1", name: "สาขาอโศก" }])
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: "stock_user", role: "STOCK_STAFF", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_1" }] }])
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_stock" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    const service = new NotificationService(prisma);

    await service.refreshStockAlertsForProducts("business_1", ["product_1"], ["branch_1"]);
    await service.refreshStockAlertsForProducts("business_1", ["product_1"], ["branch_1"]);

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_dedupeKey: { businessId: "business_1", dedupeKey: "stock-alert:branch_1:product_1" } },
      create: expect.objectContaining({ type: "STOCK_ALERT", severity: "WARNING" })
    }));
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { businessId: "business_1", dedupeKey: "stock-alert:branch_1:product_1", resolvedAt: null },
      data: { resolvedAt: expect.any(Date) }
    });
  });

  it("syncs existing low stock into the summary without waiting for a new stock mutation", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: "viewer", role: "VIEWER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_1" }] }),
        findMany: jest.fn().mockResolvedValue([{ userId: "viewer", role: "VIEWER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_1" }] }])
      },
      product: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: "product_1" }])
          .mockResolvedValueOnce([
            {
              id: "product_1",
              name: "น้ำตาล",
              minStock: 10,
              balances: [{ quantity: 3, warehouse: { branchId: "branch_1" } }]
            }
          ])
          .mockResolvedValueOnce([
            {
              id: "product_1",
              name: "น้ำตาล",
              minStock: 10,
              balances: [{ quantity: 3, warehouse: { branchId: "branch_1" } }]
            }
          ])
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_1", name: "สาขาอโศก" }])
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_stock" }),
        updateMany: jest.fn()
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([])
      },
      stockTransfer: { count: jest.fn().mockResolvedValue(0) },
      stockCount: { count: jest.fn().mockResolvedValue(0) }
    };
    const service = new NotificationService(prisma);

    await service.summary(user);

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_dedupeKey: { businessId: "business_1", dedupeKey: "stock-alert:branch_1:product_1" } },
      create: expect.objectContaining({ type: "STOCK_ALERT", title: "น้ำตาล ใกล้หมด" })
    }));
  });

  it("scopes summary counts to the selected branch while keeping store-wide notifications", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_1", businessId: "business_1", status: "ACTIVE" }),
        findMany: jest.fn().mockResolvedValue([{ id: "branch_1", name: "สาขาอโศก" }])
      },
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: "user_owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      stockTransfer: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      stockCount: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      notificationRecipient: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new NotificationService(prisma);

    await service.summary(user, { branchId: "branch_1" });

    expect(prisma.notificationRecipient.count).toHaveBeenCalledWith({
      where: {
        userId: "user_owner",
        readAt: null,
        archivedAt: null,
        notification: {
          businessId: "business_1",
          OR: [{ branchId: "branch_1" }, { branchId: null }]
        }
      }
    });
  });

  it("returns grouped active counts for bell shortcuts", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: "user_owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2)
      },
      product: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: "out", minStock: 5, balances: [{ quantity: 0, warehouse: { branchId: "branch_1" } }, { quantity: 0, warehouse: { branchId: "branch_2" } }, { quantity: 0, warehouse: { branchId: "branch_3" } }, { quantity: 8, warehouse: { branchId: "branch_4" } }, { quantity: 9, warehouse: { branchId: "branch_5" } }] },
            { id: "low", minStock: 5, balances: [{ quantity: 1, warehouse: { branchId: "branch_1" } }, { quantity: 2, warehouse: { branchId: "branch_2" } }, { quantity: 3, warehouse: { branchId: "branch_3" } }, { quantity: 4, warehouse: { branchId: "branch_4" } }, { quantity: 5, warehouse: { branchId: "branch_5" } }] }
          ])
      },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: "branch_1" }, { id: "branch_2" }, { id: "branch_3" }, { id: "branch_4" }, { id: "branch_5" }]) },
      stockTransfer: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ status: "REQUESTED", sourceWarehouse: { branchId: "branch_1" }, destinationWarehouse: { branchId: "branch_2" } }])
          .mockResolvedValueOnce([{ status: "IN_TRANSIT", sourceWarehouse: { branchId: "branch_1" }, destinationWarehouse: { branchId: "branch_2" } }])
      },
      stockCount: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(6) },
      notificationRecipient: {
        count: jest.fn()
          .mockResolvedValueOnce(9)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(0),
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new NotificationService(prisma);

    await expect(service.summary(user)).resolves.toEqual(expect.objectContaining({
      outOfStockCount: 3,
      lowStockCount: 5,
      transferRequestCount: 1,
      transferReceiveCount: 1,
      staffRequestCount: 2,
      stockCountReviewCount: 6
    }));
  });

  it("sends receive confirmations to destination branch managers before falling back to the owner", async () => {
    const createPrisma = (members: any[]) => ({
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "transfer_1",
          documentNo: "TRF-TEST",
          status: "IN_TRANSIT",
          sourceApprovedById: "source_manager",
          sourceWarehouse: { branchId: "branch_source", branch: { name: "ต้นทาง" } },
          destinationWarehouse: { branchId: "branch_dest", branch: { name: "ปลายทาง" } }
        })
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue(members)
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_receive" })
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    });
    const withBranchManager: any = createPrisma([
      { userId: "owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] },
      { userId: "dest_manager", role: "BRANCH_MANAGER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_dest" }] },
      { userId: "source_manager", role: "BRANCH_MANAGER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_source" }] }
    ]);
    const ownerFallback: any = createPrisma([
      { userId: "owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] },
      { userId: "source_manager", role: "BRANCH_MANAGER", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_source" }] }
    ]);

    await new NotificationService(withBranchManager).createTransferReceiveNotification("business_1", "transfer_1");
    await new NotificationService(ownerFallback).createTransferReceiveNotification("business_1", "transfer_1");

    expect(withBranchManager.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        branchId: "branch_dest",
        title: "คำขอโอน TRF-TEST รอยืนยันรับสินค้า",
        actionHref: "/app/transfers/requests",
        dedupeKey: "transfer-receive:transfer_1"
      })
    }));
    expect(withBranchManager.notificationRecipient.createMany.mock.calls[0][0].data).toEqual([
      { notificationId: "notification_receive", userId: "dest_manager" }
    ]);
    expect(ownerFallback.notificationRecipient.createMany.mock.calls[0][0].data).toEqual([
      { notificationId: "notification_receive", userId: "owner" }
    ]);
  });

  it("sends receive confirmations to all-branch managers without explicit branch assignments", async () => {
    const prisma: any = {
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "transfer_1",
          documentNo: "TRF-TEST",
          status: "IN_TRANSIT",
          sourceApprovedById: "source_manager",
          sourceWarehouse: { branchId: "branch_source", branch: { name: "ต้นทาง" } },
          destinationWarehouse: { branchId: "branch_dest", branch: { name: "ปลายทาง" } }
        })
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: "owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] },
          { userId: "all_branch_manager", role: "MANAGER", permissionOverrides: {}, branchAssignments: [] }
        ])
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_receive" })
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };

    await new NotificationService(prisma).createTransferReceiveNotification("business_1", "transfer_1");

    expect(prisma.notificationRecipient.createMany.mock.calls[0][0].data).toEqual([
      { notificationId: "notification_receive", userId: "all_branch_manager" }
    ]);
  });

  it("returns live bell counts for the selected branch only", async () => {
    function createPrisma(liveProducts: any[]) {
      return {
        branch: {
          findFirst: jest.fn().mockResolvedValue({ id: "selected_branch", businessId: "business_1", status: "ACTIVE" }),
          findMany: jest.fn().mockResolvedValue([{ id: "selected_branch", name: "สาขาที่เลือก" }])
        },
        businessMember: {
          findFirst: jest.fn().mockResolvedValue({ userId: "user_owner", role: "OWNER", permissionOverrides: {}, branchAssignments: [] }),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0)
        },
        product: {
          findMany: jest.fn()
            .mockResolvedValueOnce(liveProducts.map((product) => ({ id: product.id })))
            .mockResolvedValueOnce(liveProducts)
            .mockResolvedValueOnce(liveProducts)
        },
        notification: {
          upsert: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 })
        },
        notificationRecipient: {
          createMany: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([])
        },
        stockTransfer: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        stockCount: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }
      };
    }
    const branchOnePrisma: any = createPrisma([
      { id: "coffee", name: "กาแฟ", minStock: 5, balances: [{ quantity: 0, warehouse: { branchId: "branch_1" } }] },
      { id: "tea", name: "ชา", minStock: 5, balances: [{ quantity: 4, warehouse: { branchId: "branch_1" } }] }
    ]);
    const branchTwoPrisma: any = createPrisma([
      { id: "coffee", name: "กาแฟ", minStock: 5, balances: [{ quantity: 8, warehouse: { branchId: "branch_2" } }] },
      { id: "tea", name: "ชา", minStock: 5, balances: [{ quantity: 2, warehouse: { branchId: "branch_2" } }] }
    ]);
    const branchMoonPrisma: any = createPrisma([
      { id: "empty_1", name: "ว่าง 1", minStock: 5, balances: [] },
      { id: "empty_2", name: "ว่าง 2", minStock: 5, balances: [] },
      { id: "empty_3", name: "ว่าง 3", minStock: 5, balances: [] }
    ]);

    await expect(new NotificationService(branchOnePrisma).summary(user, { branchId: "branch_1" })).resolves.toEqual(expect.objectContaining({
      outOfStockCount: 1,
      lowStockCount: 1,
      activeCount: 2
    }));
    await expect(new NotificationService(branchTwoPrisma).summary(user, { branchId: "branch_2" })).resolves.toEqual(expect.objectContaining({
      outOfStockCount: 0,
      lowStockCount: 1,
      activeCount: 1
    }));
    await expect(new NotificationService(branchMoonPrisma).summary(user, { branchId: "branch_moon" })).resolves.toEqual(expect.objectContaining({
      outOfStockCount: 3,
      lowStockCount: 0,
      activeCount: 3
    }));
  });

  it("creates an out-of-stock alert for a scoped branch that has no product balance yet", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "product_1",
            name: "น้ำดื่ม",
            minStock: 5,
            balances: [{ quantity: 8, warehouse: { branchId: "branch_1" } }]
          }
        ])
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_2", name: "สาขาดวงจันทร์" }])
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: "stock_user", role: "STOCK_STAFF", permissionOverrides: {}, branchAssignments: [{ branchId: "branch_2" }] }])
      },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: "notification_stock" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      notificationRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    const service = new NotificationService(prisma);

    await service.refreshStockAlertsForProducts("business_1", ["product_1"], ["branch_2"]);

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_dedupeKey: { businessId: "business_1", dedupeKey: "stock-alert:branch_2:product_1" } },
      create: expect.objectContaining({
        branchId: "branch_2",
        severity: "CRITICAL",
        title: "น้ำดื่ม หมดสต็อก",
        body: "สาขา สาขาดวงจันทร์ คงเหลือ 0 / จุดแจ้งเตือน 5"
      })
    }));
  });
});
